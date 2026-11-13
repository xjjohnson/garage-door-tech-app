/**
 * Quotes and invoices as printable HTML pages, turned into a PDF on the phone
 * (src/lib/deviceMedia.ts). Plain black on white, one page for a normal job,
 * with QR codes to pay and the customer's signature. Kept free of React.
 */
import qrcode from 'qrcode-generator';
import { Signature, signatureSvg } from './attachments';
import { formatJobDate } from './jobs';
import { balance, Business, Invoice, invoiceStatus, optionLabel, paid, PAY_LABEL, payLinks, STATUS_LABEL } from './invoices';
import { formatMoney, TIER_LABEL } from './prices';
import { Quote } from './quote';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A QR code as an inline SVG, or empty if the text is too long. */
export function qrSvg(text: string, cell = 4): string {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: cell, margin: 4, scalable: false });
  } catch {
    return '';
  }
}

const STYLE = `
body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#000;margin:32px;font-size:14px}
h1{font-size:26px;margin:0}h2{font-size:18px;margin:24px 0 8px}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
.muted{color:#444}.right{text-align:right}
table{width:100%;border-collapse:collapse;margin-top:12px}
td,th{padding:8px 6px;border-bottom:1px solid #999;text-align:left;vertical-align:top}
td.amt,th.amt{text-align:right;white-space:nowrap}
tr.total td{font-weight:800;font-size:16px;border-bottom:2px solid #000}
.badge{display:inline-block;border:2px solid #000;padding:2px 8px;font-weight:800}
.pay{display:flex;gap:24px;flex-wrap:wrap}.pay div{text-align:center}
.sig{margin-top:24px}.sig svg{border-bottom:1px solid #000}
.opt{border:2px solid #000;padding:10px;margin-top:12px;page-break-inside:avoid}
.chosen{border-width:4px}
`;

function page(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`;
}

function header(business: Business, right: string): string {
  return `<div class="top"><div><h1>${escapeHtml(business.name || 'Garage door service')}</h1>${business.phone ? `<div class="muted">${escapeHtml(business.phone)}</div>` : ''}</div><div class="right">${right}</div></div>`;
}

export function signatureBlock(sig: Signature | undefined, what: string): string {
  if (!sig) return `<div class="sig"><p>${escapeHtml(what)}</p><p>Signature: ______________________________ &nbsp; Date: ____________</p></div>`;
  return `<div class="sig"><p>${escapeHtml(what)}</p>${signatureSvg(sig)}<div>${escapeHtml(sig.name || 'Customer')} · ${escapeHtml(formatJobDate(sig.at))}</div></div>`;
}

export function invoiceHtml(inv: Invoice, business: Business, sig?: Signature, extra: { warranty?: string } = {}): string {
  const status = invoiceStatus(inv);
  const due = balance(inv);
  const rows = inv.lines.map((l) => `<tr><td>${escapeHtml(l.label)}</td><td class="amt">${formatMoney(l.cents)}</td></tr>`).join('');
  const payments = inv.payments
    .map((p) => `<tr><td>${escapeHtml(`${PAY_LABEL[p.method]}${p.reference ? ` #${p.reference}` : ''}, ${formatJobDate(p.at)}`)}</td><td class="amt">-${formatMoney(p.amount)}</td></tr>`)
    .join('');
  const ways = due > 0 && status !== 'void' ? payLinks(business, due, `Invoice ${inv.number}`) : [];
  const pay = ways.length
    ? `<h2>Pay ${formatMoney(due)}</h2><div class="pay">${ways
        .map((w) => `<div>${w.url ? qrSvg(w.url) : ''}<div><b>${escapeHtml(w.label)}</b> ${escapeHtml(w.handle)}</div></div>`)
        .join('')}</div><p class="muted">Cash and check are welcome too.</p>`
    : '';
  const body =
    header(business, `<div><b>Invoice ${escapeHtml(inv.number)}</b></div><div>${escapeHtml(formatJobDate(inv.createdAt))}</div><div class="badge">${STATUS_LABEL[status]}</div>`) +
    `<h2>Bill to</h2><div>${escapeHtml(inv.billTo || 'Customer')}</div>${inv.address ? `<div>${escapeHtml(inv.address)}</div>` : ''}` +
    `<table><tr><th>${escapeHtml(optionLabel(inv))}</th><th class="amt">Amount</th></tr>${rows}` +
    (inv.tax > 0 ? `<tr><td>Subtotal</td><td class="amt">${formatMoney(inv.subtotal)}</td></tr><tr><td>Tax</td><td class="amt">${formatMoney(inv.tax)}</td></tr>` : '') +
    `<tr class="total"><td>Total</td><td class="amt">${formatMoney(inv.total)}</td></tr>${payments}` +
    (paid(inv) > 0 ? `<tr class="total"><td>Amount due</td><td class="amt">${formatMoney(due)}</td></tr>` : '') +
    `</table>` +
    (extra.warranty ? `<p>${escapeHtml(extra.warranty)}</p>` : '') +
    pay +
    signatureBlock(sig, 'Work completed to my satisfaction.') +
    (business.phone ? `<p class="muted">Questions? Call ${escapeHtml(business.phone)}.</p>` : '');
  return page(`Invoice ${inv.number}`, body);
}

export function quoteHtml(job: { customer: string; address: string; savedAt: number; accepted?: { tier: string } }, quote: Quote, business: Business, sig?: Signature, now = Date.now()): string {
  const opts = quote.options
    .filter((o) => o.available)
    .map((o) => {
      const chosen = job.accepted?.tier === o.tier;
      const rows = o.lines
        .filter((l) => l.cents > 0)
        .map((l) => `<tr><td>${escapeHtml(l.label)}</td><td class="amt">${formatMoney(l.cents)}</td></tr>`)
        .join('');
      return `<div class="opt${chosen ? ' chosen' : ''}"><b>${escapeHtml(TIER_LABEL[o.tier])}${chosen ? ' (chosen)' : ''}</b><table>${rows}${o.tax > 0 ? `<tr><td>Tax</td><td class="amt">${formatMoney(o.tax)}</td></tr>` : ''}<tr class="total"><td>Total</td><td class="amt">${formatMoney(o.total)}</td></tr></table></div>`;
    })
    .join('');
  const body =
    header(business, `<div><b>Quote</b></div><div>${escapeHtml(formatJobDate(now))}</div>`) +
    `<h2>For</h2><div>${escapeHtml(job.customer || 'Customer')}</div>${job.address ? `<div>${escapeHtml(job.address)}</div>` : ''}` +
    (quote.blocked ? `<p>${escapeHtml(quote.blocked)}</p>` : opts) +
    signatureBlock(sig, job.accepted ? `I approve the ${TIER_LABEL[job.accepted.tier as keyof typeof TIER_LABEL] ?? ''} option above.` : 'I approve the option marked above.');
  return page('Quote', body);
}

/** A safe file name: "Invoice 1001 Pat Smith.pdf". */
export function pdfName(title: string, who: string): string {
  return `${`${title} ${who}`.replace(/[^A-Za-z0-9 ._-]/g, '').replace(/\s+/g, ' ').trim() || 'document'}.pdf`;
}

/** One page with the customer's signature on an invoice, to attach to Odoo's invoice. */
export function signedPageHtml(inv: Pick<Invoice, 'number' | 'billTo' | 'address'>, odooName: string, business: Business, sig: Signature): string {
  const body =
    header(business, `<div><b>Invoice ${escapeHtml(odooName || inv.number)}</b></div>`) +
    `<h2>Customer signature</h2><div>${escapeHtml(inv.billTo || 'Customer')}</div>${inv.address ? `<div>${escapeHtml(inv.address)}</div>` : ''}` +
    signatureBlock(sig, 'Work completed to my satisfaction.');
  return page(`Signed invoice ${odooName || inv.number}`, body);
}
