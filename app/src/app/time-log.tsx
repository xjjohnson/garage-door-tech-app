import { Page } from '../components/Page';
import { WorkLogScreen } from '../screens/WorkLogScreen';

/** /time-log: clock in and out, miles driven and the week's totals. */
export default function TimeLogRoute() {
  return (
    <Page title="Time and miles" testID="time-log-page">
      <WorkLogScreen />
    </Page>
  );
}
