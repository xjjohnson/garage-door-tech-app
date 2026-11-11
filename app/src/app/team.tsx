import { Page } from '../components/Page';
import { TeamScreen } from '../screens/TeamScreen';

/** /team: jobs assigned through the business's Odoo, and dispatch. */
export default function TeamRoute() {
  return (
    <Page title="Team" testID="team-page">
      <TeamScreen />
    </Page>
  );
}
