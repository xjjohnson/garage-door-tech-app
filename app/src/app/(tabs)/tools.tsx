import { SectionScroll } from '../../components/SectionScroll';
import { useDispatcherOnly, useSalesOnly } from '../../lib/useDepartments';
import { DispatchMore } from '../../screens/DispatchMore';
import { SalesMore } from '../../screens/SalesMore';
import { ToolsScreen } from '../../screens/ToolsScreen';

export default function ToolsRoute() {
  const dispatcherOnly = useDispatcherOnly();
  const salesOnly = useSalesOnly();
  return (
    <SectionScroll>
      {dispatcherOnly ? <DispatchMore /> : salesOnly ? <SalesMore /> : <ToolsScreen />}
    </SectionScroll>
  );
}
