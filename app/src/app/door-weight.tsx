import { Page } from '../components/Page';
import { DoorWeightScreen } from '../screens/DoorWeightScreen';

export default function DoorWeightRoute() {
  return (
    <Page title="Door weight estimate" testID="door-weight-page">
      <DoorWeightScreen />
    </Page>
  );
}
