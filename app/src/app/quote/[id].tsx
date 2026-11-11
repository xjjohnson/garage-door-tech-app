import { router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Page } from '../../components/Page';
import { useJobs } from '../../lib/useJobs';
import { QuoteScreen } from '../../screens/QuoteScreen';
import { colors, type } from '../../theme';

/** /quote/<job id>: the good / better / best quote for one saved job. */
export default function QuoteRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { jobs, loaded } = useJobs();
  const job = jobs.find((j) => j.id === id);
  return (
    <Page title="Quote" testID="quote-sheet">
      {job ? (
        <QuoteScreen job={job} onSetPrices={() => router.push('/price-sheet')} />
      ) : loaded ? (
        <Text style={{ fontSize: type.body, color: colors.text }}>That job isn't saved on this phone any more.</Text>
      ) : null}
    </Page>
  );
}
