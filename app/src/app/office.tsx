import { useLocalSearchParams } from 'expo-router';
import { Page } from '../components/Page';
import { OfficeAreaScreen, OfficeTab } from '../screens/OfficeAreaScreen';

/** /office: the Office area. */
export default function OfficeRoute() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return (
    <Page title="Office" testID="office-page">
      <OfficeAreaScreen initial={tab as OfficeTab | undefined} />
    </Page>
  );
}
