import { router, useLocalSearchParams } from 'expo-router';
import { Page } from '../components/Page';
import { PriceBookItem } from '../lib/priceBook';
import { addItem, newLineId } from '../lib/ticket';
import { useJobs } from '../lib/useJobs';
import { PriceBookScreen } from '../screens/PriceBookScreen';

/** /ticket-add?id=<job id>&kind=service|material: pick from the price book onto the job's ticket. */
export default function TicketAddRoute() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const { setTicket } = useJobs();
  const pick = (item: PriceBookItem) => {
    // Typed as the section it was added from, so a part put under Services still shows there.
    const as: PriceBookItem = kind === 'service' || kind === 'material' ? { ...item, kind } : item;
    setTicket(id, (t) => addItem(t, as, newLineId(Date.now())));
    if (router.canGoBack()) router.back();
  };
  return (
    <Page title={kind === 'service' ? 'Add a service' : kind === 'material' ? 'Add a material' : 'Add to the ticket'} testID="ticket-add-page">
      <PriceBookScreen onPick={pick} />
    </Page>
  );
}
