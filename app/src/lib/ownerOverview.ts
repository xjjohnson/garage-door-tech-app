/**
 * The owner's one-page overview: every red number from every area, grouped by area, and the
 * Today block. Plain logic over the numbers the phone already counted, so it is tested without Odoo.
 */
import { Badges } from './deptBadges';

export type OverviewArea = 'dispatch' | 'office' | 'sales' | 'warehouse' | 'purchasing';

export interface OverviewLine {
  label: string;
  n: number;
  /** The page to open inside the area. */
  tab: string;
}
export interface OverviewGroup {
  area: OverviewArea;
  title: string;
  lines: OverviewLine[];
  total: number;
}

/** Only lines that need a look, only areas that have one, and the busiest area first. */
export function overviewGroups(b: Badges): OverviewGroup[] {
  const raw: { area: OverviewArea; title: string; lines: OverviewLine[] }[] = [
    {
      area: 'dispatch',
      title: 'Dispatch',
      lines: [
        { label: 'Jobs with no tech', n: b.dispatch.unassigned, tab: 'unassigned' },
        { label: 'Jobs with no start time', n: b.dispatch.noTime, tab: 'notime' },
        { label: 'Running late', n: b.dispatch.late, tab: 'late' },
        { label: 'Double booked', n: b.dispatch.double, tab: 'double' },
      ],
    },
    {
      area: 'office',
      title: 'Office',
      lines: [
        { label: 'Done, not invoiced', n: b.office.notInvoiced, tab: 'notinvoiced' },
        { label: 'Invoices overdue', n: b.office.overdue, tab: 'overdue' },
        { label: 'Jobs that came back', n: b.office.cameBack, tab: 'cameback' },
        { label: 'Open complaints', n: b.office.complaints, tab: 'complaints' },
      ],
    },
    {
      area: 'sales',
      title: 'Sales',
      lines: [
        { label: 'Quotes gone quiet', n: b.sales.quiet, tab: 'quiet' },
        { label: 'Follow-ups due', n: b.sales.followUps, tab: 'followups' },
        { label: 'Plans about to renew', n: b.sales.renewals, tab: 'renew' },
        { label: 'Repairs found, not sold', n: b.sales.flagged, tab: 'flagged' },
      ],
    },
    { area: 'warehouse', title: 'Warehouse', lines: [{ label: 'Parts to receive', n: b.warehouse.receive, tab: 'receive' }] },
    {
      area: 'purchasing',
      title: 'Purchasing',
      lines: [
        { label: 'Under minimum, to order', n: b.purchasing.toOrder, tab: 'toorder' },
        { label: 'Draft orders to review', n: b.purchasing.drafts, tab: 'orders' },
        { label: 'Orders past their date', n: b.purchasing.late, tab: 'orders' },
      ],
    },
  ];
  return raw
    .map((g) => {
      const lines = g.lines.filter((l) => l.n > 0);
      return { ...g, lines, total: lines.reduce((n, l) => n + l.n, 0) };
    })
    .filter((g) => g.total > 0)
    .sort((a, b2) => b2.total - a.total);
}

export const ROUTE: Record<OverviewArea, string> = { dispatch: '/dispatch', office: '/office', sales: '/sales-area', warehouse: '/warehouse', purchasing: '/purchasing' };
