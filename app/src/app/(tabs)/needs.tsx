import { SectionScroll } from '../../components/SectionScroll';
import { NeedsYouScreen } from '../../screens/DispatchNeeds';

/** Needs you: the dispatcher's one list of late, unassigned, no-time and double booked jobs. */
export default function NeedsRoute() {
  return (
    <SectionScroll>
      <NeedsYouScreen />
    </SectionScroll>
  );
}
