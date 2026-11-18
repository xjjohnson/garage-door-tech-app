import { useLocalSearchParams } from 'expo-router';
import { Page } from '../components/Page';
import { SalesAreaScreen, SalesTab } from '../screens/SalesAreaScreen';

/** /sales-area: the Sales area. */
export default function SalesRoute() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return (
    <Page title="Sales" testID="sales-page">
      <SalesAreaScreen initial={tab as SalesTab | undefined} />
    </Page>
  );
}
