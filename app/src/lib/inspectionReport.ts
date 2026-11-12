/**
 * The inspection report as a printable page (made into a PDF on the phone),
 * laid out like the SafetyCulture report it replaces: the job's details and
 * score, flagged items and actions first, then every section, then the
 * photos, and the customer's signature. Kept free of React.
 */
import { Signature } from './attachments';
import { doorLine, flags, Inspection, isFlagged, RATING_LABEL, sections, summary } from './inspection';
import { Business } from './invoices';
import { formatJobDate } from './jobs';
import { escapeHtml, signatureBlock } from './pdf';

export interface ReportPhoto {
  /** The inspection item it shows, if any. */
  item?: string;
  /** A data URL. */
  src: string;
}

export interface ReportInfo {
  customer: string;
  address: string;
  /** Odoo job or order number, when there is one. */
  reference?: string;
  /** Who did the inspection. */
  inspector: string;
}

const STYLE = `
body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#000;margin:28px;font-size:13px}
h1{font-size:24px;margin:0}h2{font-size:17px;margin:22px 0 6px;border-bottom:2px solid #000;padding-bottom:3px}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
.logo{height:64px}
.muted{color:#444}
.facts{display:grid;grid-template-columns:130px 1fr;row-gap:3px;margin-top:12px}
.facts b{font-weight:700}
.stats{display:flex;gap:12px;margin-top:14px}
.stat{border:2px solid #000;padding:6px 12px;text-align:center;min-width:90px}
.stat .n{font-size:22px;font-weight:800}
table{width:100%;border-collapse:collapse}
td{padding:5px 6px;border-bottom:1px solid #bbb;vertical-align:top}
td.r{width:110px;font-weight:700;white-space:nowrap}
tr.flag td{background:#fde8ea}
tr.flag td.r{color:#b00020}
.note{color:#333;font-size:12px}
.act{font-size:12px;font-weight:700}
.photos{display:flex;flex-wrap:wrap;gap:8px}
.photos figure{margin:0;width:31%;page-break-inside:avoid}
.photos img{width:100%;border:1px solid #999}
.photos figcaption{font-size:11px}
.sig{margin-top:22px;page-break-inside:avoid}.sig svg{border-bottom:1px solid #000}
.sect{page-break-inside:auto}
`;

function itemLabel(insp: Inspection, key: string): string {
  for (const s of sections(insp)) {
    const i = s.items.find((x) => x.key === key);
    if (i) return `${s.title} · ${i.def.label}`;
  }
  return '';
}

export function inspectionHtml(insp: Inspection, info: ReportInfo, business: Business, logo: string, photos: ReportPhoto[], sig?: Signature): string {
  const s = summary(insp);
  const fl = flags(insp);
  const e = escapeHtml;

  const head =
    `<div class="top"><div>${logo ? `<img class="logo" src="${logo}" alt="">` : ''}<h1>${insp.gate && insp.doors.length === 0 ? 'Gate inspection' : 'Garage door inspection'}</h1></div>` +
    `<div class="muted" style="text-align:right">${e(business.name || '')}${business.phone ? `<br>${e(business.phone)}` : ''}</div></div>` +
    `<div class="facts"><b>Customer</b><span>${e(info.customer || 'Customer')}</span>` +
    `<b>Location</b><span>${e(info.address || '')}</span>` +
    (info.reference ? `<b>Job</b><span>${e(info.reference)}</span>` : '') +
    `<b>Conducted on</b><span>${e(formatJobDate(insp.at))}</span>` +
    `<b>Prepared by</b><span>${e(info.inspector || business.name || '')}</span>` +
    `<b>Lubricated</b><span>${insp.lubricated ? 'Rollers, track and opener lubricated' : 'No'}</span></div>` +
    `<div class="stats"><div class="stat"><div class="n">${s.score === null ? '–' : `${s.score}%`}</div>Score</div>` +
    `<div class="stat"><div class="n">${s.flagged}</div>Flagged</div><div class="stat"><div class="n">${s.actions}</div>Actions</div>` +
    `<div class="stat"><div class="n">${s.answered}/${s.total}</div>Checked</div></div>`;

  const flagged = fl.length
    ? `<h2>Flagged items</h2><table>${fl
        .map(
          (f) =>
            `<tr class="flag"><td>${e(f.section)} · ${e(f.label)}${f.note.trim() ? `<div class="note">${e(f.note.trim())}</div>` : ''}${f.action.trim() ? `<div class="act">Action: ${e(f.action.trim())}</div>` : ''}</td><td class="r">${e(RATING_LABEL[f.rating])}</td></tr>`,
        )
        .join('')}</table>`
    : '';

  const doorFacts = (title: string) => {
    const d = insp.doors.find((_, i) => title === `Door ${i + 1}`);
    if (!d) return '';
    const line = doorLine(d);
    return line ? `<p class="muted">${e(line)}</p>` : '';
  };
  const motorFacts = (title: string) => {
    const m = /^Door (\d+) · Motor (\d+)$/.exec(title);
    const motor = m ? insp.doors[+m[1] - 1]?.motors[+m[2] - 1] : undefined;
    const line = motor ? [motor.maker, motor.built ? `built ${motor.built}` : ''].filter(Boolean).join(', ') : '';
    return line ? `<p class="muted">${e(line)}</p>` : '';
  };

  const body = sections(insp)
    .map((sec) => {
      const rows = sec.items
        .map((i) => {
          const a = i.answer;
          const r = a?.rating;
          return `<tr${isFlagged(r) ? ' class="flag"' : ''}><td>${e(i.def.label)}${a?.note.trim() ? `<div class="note">${e(a.note.trim())}</div>` : ''}${a?.action.trim() ? `<div class="act">Action: ${e(a.action.trim())}</div>` : ''}</td><td class="r">${r ? e(RATING_LABEL[r]) : '<span class="muted">Not checked</span>'}</td></tr>`;
        })
        .join('');
      const gateType = sec.key === 'gate-ul' && insp.gate?.type ? `<p class="muted">${insp.gate.type === 'swing' ? 'Swing gate' : 'Slide gate'}</p>` : '';
      return `<div class="sect"><h2>${e(sec.title)}</h2>${doorFacts(sec.title)}${motorFacts(sec.title)}${gateType}<table>${rows}</table></div>`;
    })
    .join('');

  const pics = photos.length
    ? `<h2>Photos</h2><div class="photos">${photos.map((p) => `<figure><img src="${p.src}" alt=""><figcaption>${e(p.item ? itemLabel(insp, p.item) : '')}</figcaption></figure>`).join('')}</div>`
    : '';

  const signed = signatureBlock(sig, 'I have received this inspection report.');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Inspection</title><style>${STYLE}</style></head><body>${head}${flagged}${body}${pics}${signed}</body></html>`;
}
