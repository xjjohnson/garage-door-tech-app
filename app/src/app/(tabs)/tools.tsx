import { SectionScroll } from '../../components/SectionScroll';
import { useDispatcherOnly, useOfficeOnly } from '../../lib/useDepartments';
import { DispatchMore } from '../../screens/DispatchMore';
import { OfficeMore } from '../../screens/OfficeMore';
import { ToolsScreen } from '../../screens/ToolsScreen';

export default function ToolsRoute() {
  const dispatcherOnly = useDispatcherOnly();
  const officeOnly = useOfficeOnly();
  return (
    <SectionScroll>
      {dispatcherOnly ? <DispatchMore /> : officeOnly ? <OfficeMore /> : <ToolsScreen />}
    </SectionScroll>
  );
}
