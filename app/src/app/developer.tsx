import { Page } from '../components/Page';
import { DeveloperScreen } from '../screens/DeveloperScreen';

export default function DeveloperRoute() {
  return (
    <Page title="Developer" testID="developer-page">
      <DeveloperScreen />
    </Page>
  );
}
