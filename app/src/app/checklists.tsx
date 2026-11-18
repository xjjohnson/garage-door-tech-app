import { OwnerOnly } from '../components/OwnerOnly';
import { Page } from '../components/Page';
import { ChecklistsScreen } from '../screens/ChecklistsScreen';

export default function PageRoute() {
  return (
    <Page title="Inspection checklists" testID="checklists-page">
      <OwnerOnly what="Inspection checklist setup">
        <ChecklistsScreen />
      </OwnerOnly>
    </Page>
  );
}
