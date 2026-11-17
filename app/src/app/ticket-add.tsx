import { router, useLocalSearchParams } from 'expo-router';
import { Page } from '../components/Page';
import { PriceBookItem } from '../lib/priceBook';
import { addItem, newLineId } from '../lib/ticket';
import { useJobs } from '../lib/useJobs';
import { PriceBookScreen } from '../screens/PriceBookScreen';

/** /ticket-add?id=<job id>&kind=service|material&section=<heading id>: pick from the price book onto the job's ticket. */
export default function TicketAddRoute() {
  const { id, kind, section } = useLocalSearchParams<{ id: string; kind?: string; section?: string }>();
  const { setTicket } = useJobs();
  const pick = (item: PriceBookItem) => {
    // Typed as the section it was added from, so a part put under Services still shows there.
    const as: PriceBookItem = kind === 'service' || kind === 'material' ? { ...item, kind } : item;
    setTicket(id, (t) => addItem(t, as, newLineId(Date.now()), section || undefined));
    if (router.canGoBack()) router.back();
  };
  return (
    <Page title={kind === 'service' ? 'Add a service' : kind === 'material' ? 'Add a material' : 'Add to the ticket'} testID="ticket-add-page">
      <PriceBookScreen onPick={pick} kind={kind === 'service' || kind === 'material' ? kind : undefined} />
    </Page>
  );
}
