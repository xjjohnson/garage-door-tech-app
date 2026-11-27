import { SectionScroll } from '../../components/SectionScroll';
import { OfficeAreaScreen } from '../../screens/OfficeAreaScreen';

/** Office: the office-only bar's tab, the whole Office area. */
export default function OfficeDeskRoute() {
  return (
    <SectionScroll>
      <OfficeAreaScreen />
    </SectionScroll>
  );
}
