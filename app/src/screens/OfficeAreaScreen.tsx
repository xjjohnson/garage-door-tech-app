import { DeptArea } from '../components/DeptArea';
import type { MenuGroup } from '../components/SectionMenu';
import { useBadges } from '../lib/useBadges';
import { useLimits } from '../lib/useLimits';
import { overdueInvoices, ordersToInvoice, quotesWaiting, unpaidInvoices } from '../lib/odooOffice';
import { CameBack, ComplaintsList, LogComplaint, WarrantyList } from './CarePages';
import { invoiceTotal, MoneyList } from './MoneyPages';

export type OfficeTab = 'notinvoiced' | 'overdue' | 'quotes' | 'unpaid' | 'cameback' | 'complaints' | 'newcomplaint' | 'warranty';
const LABELS: Record<OfficeTab, string> = {
  notinvoiced: 'Done, not invoiced',
  overdue: 'Invoices overdue',
  quotes: 'Quotes waiting for a yes',
  unpaid: 'Unpaid invoices',
  cameback: 'Came back',
  complaints: 'Open complaints',
  newcomplaint: 'Log a complaint',
  warranty: 'Warranty',
};

/**
 * Office: billing and money, and the customers who need looking after. Invoices, payments and
 * quotes are Odoo's own; complaints are to-dos on the customer; warranty is read from equipment.
 */
export function OfficeAreaScreen({ initial, now = Date.now }: { initial?: OfficeTab; now?: () => number }) {
  const b = useBadges().office;
  const limits = useLimits();
  const groups: MenuGroup<OfficeTab>[] = [
    {
      title: 'Needs you now',
      items: [
        { id: 'notinvoiced', label: LABELS.notinvoiced, detail: 'Approved orders with nothing billed yet', badge: b.notInvoiced },
        { id: 'overdue', label: LABELS.overdue, detail: 'Past the due date', badge: b.overdue },
        { id: 'quotes', label: LABELS.quotes, detail: 'Sent, no answer yet' },
      ],
    },
    { title: 'Money in', items: [{ id: 'unpaid', label: LABELS.unpaid, detail: 'Everything customers still owe' }] },
    {
      title: 'Customers',
      items: [
        { id: 'cameback', label: LABELS.cameback, detail: 'The same house again soon', badge: b.cameBack },
        { id: 'complaints', label: LABELS.complaints, detail: 'To-dos on customers', badge: b.complaints },
        { id: 'newcomplaint', label: LABELS.newcomplaint, detail: 'Save one in Odoo' },
        { id: 'warranty', label: LABELS.warranty, detail: 'Who is covered, and for how long' },
      ],
    },
  ];
  return (
    <DeptArea<OfficeTab>
      area="Office"
      who="the office"
      need="office"
      prefix="office"
      groups={groups}
      labels={LABELS}
      initial={initial}
      page={(tab, client) => {
        switch (tab) {
          case 'notinvoiced':
            return <MoneyList client={client} invoice={false} load={() => ordersToInvoice(client, limits, now())} empty="Nothing is waiting to be invoiced." testID="notinvoiced" header={invoiceTotal} />;
          case 'overdue':
            return <MoneyList client={client} invoice load={() => overdueInvoices(client, limits, now())} empty="No invoice is past due." testID="overdue" header={invoiceTotal} />;
          case 'quotes':
            return <MoneyList client={client} invoice={false} load={() => quotesWaiting(client, now())} empty="No quote is waiting." testID="quotes" />;
          case 'unpaid':
            return <MoneyList client={client} invoice load={() => unpaidInvoices(client, now())} empty="Nobody owes anything." testID="unpaid" header={invoiceTotal} />;
          case 'cameback':
            return <CameBack client={client} limits={limits} now={now} />;
          case 'complaints':
            return <ComplaintsList client={client} />;
          case 'newcomplaint':
            return <LogComplaint client={client} now={now} />;
          case 'warranty':
            return <WarrantyList client={client} now={now} />;
        }
      }}
    />
  );
}
