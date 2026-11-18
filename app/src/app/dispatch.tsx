import { Page } from '../components/Page';
import { DispatchAreaScreen } from '../screens/DispatchAreaScreen';

/** /dispatch: the dispatcher's area. */
export default function DispatchRoute() {
  return (
    <Page title="Dispatch" testID="dispatch-page">
      <DispatchAreaScreen />
    </Page>
  );
}
