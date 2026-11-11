import { Page } from '../components/Page';
import { BackupScreen } from '../screens/BackupScreen';

export default function BackupRoute() {
  return (
    <Page title="Back up and restore" testID="backup-page">
      <BackupScreen />
    </Page>
  );
}
