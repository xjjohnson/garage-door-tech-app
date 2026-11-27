import { SectionScroll } from '../../components/SectionScroll';
import { OwnerAreas } from '../../screens/OwnerDesk';

/** Areas: an owner-bar tab (anyone else who lands here goes Home). */
export default function AreasRoute() {
  return (
    <SectionScroll>
      <OwnerAreas />
    </SectionScroll>
  );
}
