import { Page } from '../components/Page';
import { PriceSheetScreen } from '../screens/PriceSheetScreen';

/**
 * /price-sheet: the old phone price sheet, kept only as the fallback for
 * spring quotes until Odoo has "Springs · Good / Better / Best" templates.
 * Reached from the quote's notice; no longer a price book tab.
 */
export default function PriceSheetRoute() {
  return (
    <Page title="Old price sheet" testID="prices-sheet">
      <PriceSheetScreen />
    </Page>
  );
}
