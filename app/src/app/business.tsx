import { Page } from '../components/Page';
import { BusinessScreen } from '../screens/BusinessScreen';

export default function PageRoute() {
  return (
    <Page title="Your business" testID="business-page">
      <BusinessScreen />
    </Page>
  );
}
