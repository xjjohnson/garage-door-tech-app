import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Page } from '../../components/Page';
import { useJobs } from '../../lib/useJobs';
import { TicketScreen } from '../../screens/TicketScreen';
import { colors, type } from '../../theme';

/** /ticket/<job id>: the job's services and materials, and its invoice. */
export default function TicketRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { jobs, loaded } = useJobs();
  const job = jobs.find((j) => j.id === id);
  return (
    <Page title="Ticket" testID="ticket-sheet">
      {job ? <TicketScreen job={job} /> : loaded ? <Text style={{ fontSize: type.body, color: colors.text }}>That job isn't saved on this phone any more.</Text> : null}
    </Page>
  );
}
