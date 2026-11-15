import { Page } from '../components/Page';
import { TeamScreen } from '../screens/TeamScreen';

/** /team: the Odoo account (sign in or out, what was found) and the jobs Odoo assigned to you. Dispatch is on Jobs › Team. */
export default function TeamRoute() {
  return (
    <Page title="Odoo account" testID="team-page">
      <TeamScreen />
    </Page>
  );
}
