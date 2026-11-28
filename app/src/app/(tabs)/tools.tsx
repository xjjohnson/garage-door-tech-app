import { SectionScroll } from '../../components/SectionScroll';
import { useDispatcherOnly, useOfficeOnly, useSalesOnly } from '../../lib/useDepartments';
import { DispatchMore } from '../../screens/DispatchMore';
import { OfficeMore } from '../../screens/OfficeMore';
import { SalesMore } from '../../screens/SalesMore';
import { ToolsScreen } from '../../screens/ToolsScreen';

export default function ToolsRoute() {
  const dispatcherOnly = useDispatcherOnly();
  const officeOnly = useOfficeOnly();
  const salesOnly = useSalesOnly();
  return (
    <SectionScroll>
      {dispatcherOnly ? <DispatchMore /> : officeOnly ? <OfficeMore /> : salesOnly ? <SalesMore /> : <ToolsScreen />}
    </SectionScroll>
  );
}
