import { Page } from '../components/Page';
import { SettingsScreen } from '../screens/SettingsScreen';

/** /settings: app version and updates, and the business and backend setup. */
export default function SettingsRoute() {
  return (
    <Page title="Settings" testID="settings-page">
      <SettingsScreen />
    </Page>
  );
}
