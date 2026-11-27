import { SectionScroll } from '../../components/SectionScroll';
import { OwnerMoney } from '../../screens/OwnerDesk';

/** Money: an owner-bar tab (anyone else who lands here goes Home). */
export default function MoneyRoute() {
  return (
    <SectionScroll>
      <OwnerMoney />
    </SectionScroll>
  );
}
