import { Page } from '../components/Page';
import { ProfileScreen } from '../screens/ProfileScreen';

/** /profile: your employee record from Odoo, opened from Settings. */
export default function ProfileRoute() {
  return (
    <Page title="Profile" testID="profile-page">
      <ProfileScreen />
    </Page>
  );
}
