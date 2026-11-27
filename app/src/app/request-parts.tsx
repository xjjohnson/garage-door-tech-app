import { Page } from '../components/Page';
import { RequestPartsScreen } from '../screens/RequestPartsScreen';

/** /request-parts: a salesperson asks the buyer for parts. */
export default function RequestPartsRoute() {
  return (
    <Page title="Request parts" testID="request-parts-page">
      <RequestPartsScreen />
    </Page>
  );
}
