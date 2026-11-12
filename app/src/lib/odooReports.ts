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
