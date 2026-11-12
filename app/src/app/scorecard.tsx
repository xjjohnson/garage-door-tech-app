import { Page } from '../components/Page';
import { ScorecardScreen } from '../screens/ScorecardScreen';

/** /scorecard: the owner's tech scorecard. */
export default function ScorecardRoute() {
  return (
    <Page title="Tech scorecard" testID="scorecard-page">
      <ScorecardScreen />
    </Page>
  );
}
