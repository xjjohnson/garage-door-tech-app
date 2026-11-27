import { SectionScroll } from '../../components/SectionScroll';
import { SalesQuotes } from '../../screens/SalesDesk';

/** Quotes: the sales-only bar's quote tables. */
export default function QuotesRoute() {
  return (
    <SectionScroll>
      <SalesQuotes />
    </SectionScroll>
  );
}
