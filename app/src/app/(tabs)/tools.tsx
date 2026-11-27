import { SectionScroll } from '../../components/SectionScroll';
import { useDispatcherOnly } from '../../lib/useDepartments';
import { DispatchMore } from '../../screens/DispatchMore';
import { ToolsScreen } from '../../screens/ToolsScreen';

export default function ToolsRoute() {
  const dispatcherOnly = useDispatcherOnly();
  return (
    <SectionScroll>
      {dispatcherOnly ? <DispatchMore /> : <ToolsScreen />}
    </SectionScroll>
  );
}
