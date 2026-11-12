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
  /** Where it goes, for the button: "the Field Service order", "the sales order S00041", "John Smith's contact". */
  label: string;
}

/** Where a job's report goes in Odoo, or null when Odoo has nothing for it yet. */
export function reportTarget(job: Pick<Job, 'id' | 'customerId' | 'odooOrder'>, appointments: Pick<Appointment, 'id' | 'jobId'>[], customers: Pick<Customer, 'id' | 'odooId' | 'name'>[], jobsModel: 'fsm.order' | 'project.task' | null): ReportTarget | null {
  const visit = appointments.find((a) => a.jobId === job.id && /^odoo-\d+$/.test(a.id));
  if (visit && jobsModel) return { model: jobsModel, id: Number(visit.id.slice(5)), label: jobsModel === 'fsm.order' ? 'the Field Service order' : 'the Odoo task' };
  if (job.odooOrder) return { model: 'sale.order', id: job.odooOrder.id, label: `the sales order ${job.odooOrder.name}`.trim() };
  const c = job.customerId ? customers.find((x) => x.id === job.customerId) : undefined;
  if (c?.odooId) return { model: 'res.partner', id: c.odooId, label: c.name.trim() ? `${c.name.trim()}'s contact` : "the customer's contact" };
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

/** The customer's email in Odoo; throws when the contact has none. */
export async function partnerEmail(client: Pick<OdooClient, 'call'>, partnerId: number): Promise<string> {
  const [p] = (await client.call('res.partner', 'read', [[partnerId]], { fields: ['email'] })) as { email?: string | false }[];
  const email = typeof p?.email === 'string' ? p.email.trim() : '';
  if (!email) throw new Error('This customer has no email in Odoo. Add one on their contact, then try again.');
  return email;
}

/** What Odoo did with the email: still in its outgoing queue, sent, or failed with Odoo's reason. */
export interface EmailResult {
  to: string;
  state: 'queued' | 'sent' | 'failed' | 'unknown';
  reason?: string;
}

/** Odoo's own email templates: "Invoice: Send by email" and "Sales: Send Quotation". */
const TEMPLATES = {
  'account.move': { module: 'account', name: 'email_template_edi_invoice', what: 'invoice' },
  'sale.order': { module: 'sale', name: 'email_template_edi_sale', what: 'quotation' },
} as const;

type TemplateModel = keyof typeof TEMPLATES;

/** Odoo's own template for the model, or else the first template for it. */
async function templateFor(client: Pick<OdooClient, 'call'>, model: TemplateModel): Promise<number> {
  const t = TEMPLATES[model];
  try {
    const [x] = (await client.call('ir.model.data', 'search_read', [[['module', '=', t.module], ['name', '=', t.name]]], { fields: ['res_id'], limit: 1 })) as { res_id?: number }[];
    if (x?.res_id) return x.res_id;
  } catch {
    // Not readable here: look for the template by its model instead.
  }
  const [id] = (await client.call('mail.template', 'search', [[['model', '=', model]]], { limit: 1, order: 'id asc' })) as number[];
  if (!id) throw new Error(`Odoo has no ${t.what} email template. Check Settings › Technical › Email Templates.`);
  return id;
}

/**
 * Emails Odoo's own invoice to the customer, the way Odoo's Send button does:
 * its invoice email template, with the invoice PDF Odoo makes, plus any extra
 * PDFs (the inspection report). Logs a note on the invoice and reads Odoo's
 * outgoing mail to say what happened.
 */
export function emailInvoice(client: Pick<OdooClient, 'call'>, moveId: number, partnerId: number, extra: PdfFile[]): Promise<EmailResult> {
  return emailRecord(client, 'account.move', moveId, partnerId, extra);
}

/** Emails an invoice or a quotation with Odoo's own template, as Odoo's Send button does. */
export async function emailRecord(client: Pick<OdooClient, 'call'>, model: TemplateModel, moveId: number, partnerId: number, extra: PdfFile[] = []): Promise<EmailResult> {
  const what = TEMPLATES[model].what;
  const to = await partnerEmail(client, partnerId);
  const ids: number[] = [];
  for (const f of extra) {
    ids.push((await client.call('ir.attachment', 'create', [{ name: f.name, type: 'binary', datas: f.base64, res_model: model, res_id: moveId, mimetype: 'application/pdf' }])) as number);
  }
  const template = await templateFor(client, model);
  const mailId = await client.call('mail.template', 'send_mail', [[template], moveId], { force_send: true, ...(ids.length ? { email_values: { attachment_ids: ids } } : {}) });
  const result = { to, ...(await mailState(client, mailId)) };
  // Like Odoo's own Send: marked sent, with a note in the chatter (best effort).
  if (model === 'account.move') await client.call(model, 'write', [[moveId], { is_move_sent: true }]).catch(() => undefined);
  else if (result.state !== 'failed') await client.call(model, 'action_quotation_sent', [[moveId]]).catch(() => undefined);
  const What = what[0].toUpperCase() + what.slice(1);
  const note = result.state === 'failed' ? `${What} email to ${to} failed: ${result.reason}` : `${What} emailed to ${to} from the app${extra.length ? `, with ${extra.map((f) => f.name).join(', ')}` : ''}.`;
  await client.call(model, 'message_post', [[moveId]], { body: note, message_type: 'comment', subtype_xmlid: 'mail.mt_note' }).catch(() => undefined);
  return result;
}

/** Odoo's outgoing mail by id. Sent mail is usually deleted, so none left means sent. */
export async function mailState(client: Pick<OdooClient, 'call'>, mailId: unknown): Promise<Omit<EmailResult, 'to'>> {
  if (typeof mailId !== 'number' || !mailId) return { state: 'unknown' };
  try {
    const [m] = (await client.call('mail.mail', 'search_read', [[['id', '=', mailId]]], { fields: ['state', 'failure_reason'] })) as { state?: string; failure_reason?: string | false }[];
    if (!m || m.state === 'sent' || m.state === 'received') return { state: 'sent' };
    if (m.state === 'exception' || m.state === 'cancel') return { state: 'failed', reason: (typeof m.failure_reason === 'string' && m.failure_reason.trim()) || 'Odoo could not send it.' };
    return { state: 'queued' };
  } catch {
    // Only Odoo admins can read outgoing mail.
    return { state: 'unknown' };
  }
}

/** What Odoo did with an email, in words. */
export function emailedText(r: EmailResult): string {
  if (r.state === 'sent') return `Odoo sent the email to ${r.to}.`;
  if (r.state === 'queued') return `Odoo has the email to ${r.to} in its outgoing mail; it goes out within a few minutes.`;
  if (r.state === 'failed') return `Odoo couldn't email ${r.to}: ${r.reason}`;
  return `Sent to Odoo for ${r.to}. Check the record in Odoo to see whether the email went out.`;
}
