import { useLocalSearchParams } from 'expo-router';
import { Page } from '../components/Page';
import { ScheduleScreen } from '../screens/ScheduleScreen';

/** /schedule: booked visits by day. /schedule?book=<customer id> opens booking for that customer. */
export default function ScheduleRoute() {
  const { book } = useLocalSearchParams<{ book?: string }>();
  return (
    <Page title="Schedule" testID="schedule-page">
      <ScheduleScreen bookFor={book} />
    </Page>
  );
}
