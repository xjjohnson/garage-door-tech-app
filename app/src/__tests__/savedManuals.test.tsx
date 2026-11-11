import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { MANUAL_LINKS } from '../data/manuals';
import { fileNameFor, looksLikePdf, ManualFiles, NotPdfError } from '../lib/manualFiles';
import { SAVED_MANUALS_KEY } from '../lib/useSavedManuals';
import { ManualsScreen } from '../screens/ManualsScreen';

const withDocs = MANUAL_LINKS.find((l) => (l.docs?.length ?? 0) >= 2)!;
const noDocs = MANUAL_LINKS.find((l) => !l.docs || l.docs.length === 0)!;

/** A phone's storage in memory. `fail` makes saving reject, as with no signal. */
function fakeFiles(opts: { fail?: Set<string>; web?: Set<string> } = {}) {
  const stored = new Map<string, string>();
  const files: ManualFiles & { stored: Map<string, string> } = {
    stored,
    save: jest.fn(async (url: string) => {
      if (opts.fail?.has(url)) throw new Error('no signal');
      if (opts.web?.has(url)) throw new NotPdfError(url);
      const uri = `file:///manuals/${fileNameFor(url)}`;
      stored.set(uri, url);
      return uri;
    }),
    has: jest.fn((uri: string) => stored.has(uri)),
    remove: jest.fn((uri: string) => void stored.delete(uri)),
    open: jest.fn(async () => {}),
  };
  return files;
}

const offlineFetch = jest.fn(async () => {
  throw new Error('offline');
}) as unknown as typeof fetch;

async function search(text: string) {
  await fireEvent.changeText(screen.getByTestId('manuals-search'), text);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('starred manuals', () => {
  it('starring saves every PDF of the entry, and a saved PDF opens with no signal', async () => {
    const files = fakeFiles();
    const openUrl = jest.fn(async () => {});
    await render(<ManualsScreen files={files} fetchImpl={offlineFetch} openUrl={openUrl} />);
    await fireEvent.press(screen.getByTestId(`star-${withDocs.id}`));
    await waitFor(() => expect(screen.getByTestId(`saved-${withDocs.id}-0`)).toBeTruthy());
    expect(files.save).toHaveBeenCalledTimes(withDocs.docs!.length);
    await waitFor(() => expect(screen.getByTestId(`saved-${withDocs.id}-${withDocs.docs!.length - 1}`)).toBeTruthy());

    await fireEvent.press(screen.getByTestId(`doc-${withDocs.id}-0`));
    expect(files.open).toHaveBeenCalledWith(expect.stringMatching(/^file:\/\/\/manuals\//), withDocs.docs![0].label);
    // No signal check and no website for a saved copy.
    expect(offlineFetch).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
    expect(screen.queryByTestId('manuals-offline')).toBeNull();
  });

  it('remembers stars between visits and lists starred entries first', async () => {
    const files = fakeFiles();
    const first = await render(<ManualsScreen files={files} />);
    await fireEvent.press(screen.getByTestId(`star-${withDocs.id}`));
    await waitFor(() => expect(screen.getByTestId(`saved-${withDocs.id}-0`)).toBeTruthy());
    await first.unmount();

    expect(JSON.parse((await AsyncStorage.getItem(SAVED_MANUALS_KEY))!).starred).toEqual([withDocs.id]);
    await render(<ManualsScreen files={files} />);
    await waitFor(() => expect(screen.getByTestId(`saved-${withDocs.id}-0`)).toBeTruthy());
    const cards = screen.getAllByTestId(/^manual-/);
    expect(cards[0].props.testID).toBe(`manual-${withDocs.id}`);
    // Already on the phone: not downloaded again.
    expect(files.save).toHaveBeenCalledTimes(withDocs.docs!.length);
  });

  it('downloads again when the phone cleared the saved files', async () => {
    const files = fakeFiles();
    const first = await render(<ManualsScreen files={files} />);
    await fireEvent.press(screen.getByTestId(`star-${withDocs.id}`));
    await waitFor(() => expect(files.save).toHaveBeenCalledTimes(withDocs.docs!.length));
    await first.unmount();
    files.stored.clear();
    await render(<ManualsScreen files={files} />);
    await waitFor(() => expect(files.save).toHaveBeenCalledTimes(withDocs.docs!.length * 2));
  });

  it('unstarring deletes the saved copies', async () => {
    const files = fakeFiles();
    await render(<ManualsScreen files={files} />);
    await fireEvent.press(screen.getByTestId(`star-${withDocs.id}`));
    await waitFor(() => expect(screen.getByTestId(`saved-${withDocs.id}-0`)).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`star-${withDocs.id}`));
    expect(files.remove).toHaveBeenCalled();
    expect(files.stored.size).toBe(0);
    expect(screen.queryByTestId(`saved-${withDocs.id}-0`)).toBeNull();
  });

  it('says what could not be saved, and Try saving again saves it', async () => {
    const fail = new Set([withDocs.docs![0].url]);
    const files = fakeFiles({ fail, web: new Set([withDocs.docs![1].url]) });
    await render(<ManualsScreen files={files} />);
    await fireEvent.press(screen.getByTestId(`star-${withDocs.id}`));
    const card = screen.getByTestId(`manual-${withDocs.id}`);
    await waitFor(() => expect(within(card).getByText('Not saved yet. Needs a signal.')).toBeTruthy());
    expect(within(card).getByText("A web page, can't be saved. Needs a signal.")).toBeTruthy();

    fail.clear();
    await fireEvent.press(screen.getByTestId(`resave-${withDocs.id}`));
    await waitFor(() => expect(screen.getByTestId(`saved-${withDocs.id}-0`)).toBeTruthy());
    expect(screen.queryByTestId(`resave-${withDocs.id}`)).toBeNull();
  });

  it("an entry with only the maker's page can be starred, and says it can't be saved", async () => {
    const files = fakeFiles();
    await render(<ManualsScreen files={files} />);
    await search(noDocs.title);
    await fireEvent.press(screen.getByTestId(`star-${noDocs.id}`));
    expect(within(screen.getByTestId(`manual-${noDocs.id}`)).getByText(/can't be saved/)).toBeTruthy();
    expect(files.save).not.toHaveBeenCalled();
  });

  it('with no storage (web), stars work but nothing is saved or promised', async () => {
    await render(<ManualsScreen files={null} />);
    expect(screen.queryByText(/save its PDFs/)).toBeNull();
    await fireEvent.press(screen.getByTestId(`star-${withDocs.id}`));
    expect(screen.getByTestId(`star-${withDocs.id}`).props.accessibilityState).toEqual({ selected: true });
    expect(screen.queryByText('Saving to this phone…')).toBeNull();
  });
});

describe('manual files', () => {
  it('knows a PDF by its first bytes, not its address', () => {
    expect(looksLikePdf([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])).toBe(true);
    expect(looksLikePdf(Array.from('<!DOC').map((c) => c.charCodeAt(0)))).toBe(false);
    expect(looksLikePdf([])).toBe(false);
  });

  it('gives every document its own file name, the same each time', () => {
    const names = new Set<string>();
    for (const l of MANUAL_LINKS) for (const d of l.docs ?? []) names.add(fileNameFor(d.url));
    const urls = new Set(MANUAL_LINKS.flatMap((l) => (l.docs ?? []).map((d) => d.url)));
    expect(names.size).toBe(urls.size);
    expect(fileNameFor(withDocs.docs![0].url)).toBe(fileNameFor(withDocs.docs![0].url));
    for (const n of names) expect(n).toMatch(/^[A-Za-z0-9_]+\.pdf$/);
  });
});
