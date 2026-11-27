import { SectionScroll } from '../../components/SectionScroll';
import { SalesInvoices } from '../../screens/SalesDesk';

/** Invoices: the sales-only bar's unpaid and overdue tables. */
export default function SalesInvoicesRoute() {
  return (
    <SectionScroll>
      <SalesInvoices />
    </SectionScroll>
  );
}
