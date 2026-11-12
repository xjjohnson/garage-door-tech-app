/**
 * Sends an inspection report (a PDF) to Odoo, attached where it's most use:
 * the Field Service order the job came from, else the job's sales order,
 * else the customer. It shows in that record's chatter with a short note.
 */
import type { Customer } from './customers';
import type { Job } from './jobs';
import type { OdooClient } from './odoo';
import type { Appointment } from './schedule';

export interface ReportTarget {
  model: string;
  id: number;
  /** For the button and the log: "Field Service order", "sales order S00041", "customer". */
  label: string;
}

/** Where a job's report goes in Odoo, or null when Odoo has nothing for it yet. */
export function reportTarget(job: Pick<Job, 'id' | 'customerId' | 'odooOrder'>, appointments: Pick<Appointment, 'id' | 'jobId'>[], customers: Pick<Customer, 'id' | 'odooId'>[], jobsModel: 'fsm.order' | 'project.task' | null): ReportTarget | null {
  const visit = appointments.find((a) => a.jobId === job.id && /^odoo-\d+$/.test(a.id));
  if (visit && jobsModel) return { model: jobsModel, id: Number(visit.id.slice(5)), label: jobsModel === 'fsm.order' ? 'Field Service order' : 'Odoo task' };
  if (job.odooOrder) return { model: 'sale.order', id: job.odooOrder.id, label: `sales order ${job.odooOrder.name}`.trim() };
  const c = job.customerId ? customers.find((x) => x.id === job.customerId) : undefined;
  if (c?.odooId) return { model: 'res.partner', id: c.odooId, label: 'customer' };
  return null;
}

/** Which model this Odoo keeps jobs in. */
export function jobsModel(client: Pick<OdooClient, 'session'>): 'fsm.order' | 'project.task' | null {
  const s = client.session;
  return s.kind === 'oca' ? 'fsm.order' : s.kind === 'task' ? 'project.task' : null;
}

/** Uploads the PDF and posts it on the record; returns the attachment id. */
export async function sendReport(client: Pick<OdooClient, 'call'>, target: ReportTarget, fileName: string, pdfBase64: string, note: string): Promise<number> {
  const id = (await client.call('ir.attachment', 'create', [{ name: fileName, type: 'binary', datas: pdfBase64, res_model: target.model, res_id: target.id, mimetype: 'application/pdf' }])) as number;
  try {
    await client.call(target.model, 'message_post', [[target.id]], { body: note, attachment_ids: [id], message_type: 'comment', subtype_xmlid: 'mail.mt_note' });
  } catch {
    // The attachment is there even if the chatter note fails (a record without chatter).
  }
  return id;
}

export interface PdfFile {
  name: string;
  base64: string;
}

/**
 * Emails PDFs to the customer from Odoo: they're attached to the record (an
 * invoice) and posted as a message to the customer's contact, which Odoo
 * sends by email. Returns the address it went to.
 */
export async function emailCustomer(client: Pick<OdooClient, 'call'>, model: string, id: number, partnerId: number, files: PdfFile[], body: string): Promise<string> {
  const [p] = (await client.call('res.partner', 'read', [[partnerId]], { fields: ['email'] })) as { email?: string | false }[];
  const email = typeof p?.email === 'string' ? p.email.trim() : '';
  if (!email) throw new Error('This customer has no email in Odoo. Add one on their contact, then try again.');
  const ids: number[] = [];
  for (const f of files) {
    ids.push((await client.call('ir.attachment', 'create', [{ name: f.name, type: 'binary', datas: f.base64, res_model: model, res_id: id, mimetype: 'application/pdf' }])) as number);
  }
  await client.call(model, 'message_post', [[id]], { body, partner_ids: [partnerId], attachment_ids: ids, message_type: 'comment', subtype_xmlid: 'mail.mt_comment' });
  return email;
}
