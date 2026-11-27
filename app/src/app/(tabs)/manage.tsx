import { SectionScroll } from '../../components/SectionScroll';
import { OwnerManage } from '../../screens/OwnerDesk';

/** Manage: an owner-bar tab (anyone else who lands here goes Home). */
export default function ManageRoute() {
  return (
    <SectionScroll>
      <OwnerManage />
    </SectionScroll>
  );
}
