import { Page } from '../components/Page';
import { PriceBookScreen } from '../screens/PriceBookScreen';

export default function PriceBookRoute() {
  return (
    <Page title="Price book" testID="price-book-page">
      <PriceBookScreen />
    </Page>
  );
}
