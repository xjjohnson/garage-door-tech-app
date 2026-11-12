import { Page } from '../components/Page';
import { OlderJobsScreen } from '../screens/OlderJobsScreen';

/** /odoo-older-jobs: pick which jobs from before 0.5.9 go to Odoo. */
export default function OlderJobsRoute() {
  return (
    <Page title="Older jobs" testID="older-jobs-page">
      <OlderJobsScreen />
    </Page>
  );
}
