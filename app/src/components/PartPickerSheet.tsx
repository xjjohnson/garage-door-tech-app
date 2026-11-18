import { PriceBookPicker } from './PriceBookPicker';
import { PriceBookItem } from '../lib/priceBook';
import { usePriceBook } from '../lib/usePriceBook';

/** The price-book picker with the phone's price book behind it, mounted only while picking so the book loads on demand. */
export function PartPickerSheet({ onPick, onClose, initialQuery }: { onPick: (i: PriceBookItem) => void; onClose: () => void; initialQuery?: string }) {
  const { book } = usePriceBook();
  return <PriceBookPicker visible items={book.items.filter((i) => i.kind === 'material')} title="Pick a part" initialQuery={initialQuery} onPick={onPick} onClose={onClose} />;
}
