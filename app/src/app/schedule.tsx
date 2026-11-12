import { useLocalSearchParams } from 'expo-router';
import { Page } from '../components/Page';
import { ScheduleScreen } from '../screens/ScheduleScreen';

/**
 * /schedule: booked visits by day. /schedule?book=<customer id> opens booking
 * for that customer; /schedule?job=<job id> books (or moves) that job's visit.
 */
export default function ScheduleRoute() {
  const { book, job } = useLocalSearchParams<{ book?: string; job?: string }>();
  return (
    <Page title="Schedule" testID="schedule-page">
      <ScheduleScreen bookFor={book} forJob={job} />
    </Page>
  );
}
