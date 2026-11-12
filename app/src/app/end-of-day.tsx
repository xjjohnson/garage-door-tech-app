import { Page } from '../components/Page';
import { EndOfDayScreen } from '../screens/EndOfDayScreen';

/** /end-of-day: wrap up the day and close it. */
export default function EndOfDayRoute() {
  return (
    <Page title="Wrap up the day" testID="end-of-day-page">
      <EndOfDayScreen />
    </Page>
  );
}
