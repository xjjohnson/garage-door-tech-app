import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import App from '../../App';
import { BRANDS, MANUAL_LINKS } from '../data/manuals';
import { checkReach, formatChecked, queryWords, searchManuals } from '../lib/manualSearch';
import { ManualsScreen } from '../screens/ManualsScreen';

describe('manual links data', () => {
  const brandIds = new Set(BRANDS.map((b) => b.id));

  it('covers every brand Justin picked', () => {
    for (const name of ['Clopay', 'Amarr', 'Wayne Dalton', 'C.H.I.', 'LiftMaster', 'Chamberlain', 'Genie', 'Linear', 'Marantec', 'Guardian']) {
      const brand = BRANDS.find((b) => b.name === name);
      expect(brand).toBeDefined();
      expect(MANUAL_LINKS.some((l) => l.brand === brand!.id)).toBe(true);
    }
  });

  it('has unique ids and known brands', () => {
    const ids = MANUAL_LINKS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of MANUAL_LINKS) expect(brandIds.has(l.brand)).toBe(true);
  });

  it("only links to the maker's own website, over https", () => {
    for (const l of MANUAL_LINKS) {
      const brand = BRANDS.find((b) => b.id === l.brand)!;
      const u = new URL(l.url);
      expect(u.protocol).toBe('https:');
      expect({ id: l.id, host: u.hostname, ok: brand.hosts.includes(u.hostname) }).toEqual({ id: l.id, host: u.hostname, ok: true });
    }
  });

  it('gives every link a real last-checked date and at least one model or keyword', () => {
    for (const l of MANUAL_LINKS) {
      expect(l.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(l.checked))).toBe(false);
      expect(l.models.length).toBeGreaterThan(0);
    }
  });
});

describe('searchManuals', () => {
  it('ignores case, spaces and dashes in model numbers', () => {
    expect(queryWords('LDO-50')).toEqual(['ldo50']);
    const ids = searchManuals('ldo 50').map((h) => h.link.id);
    // Two words, both must match: "ldo" and "50" are both in LDO50.
    expect(ids).toContain('linear-manuals');
  });

  it('finds a model by its number and puts exact matches first', () => {
    const hits = searchManuals('B4613TC');
    expect(hits[0].link.id).toBe('chamberlain-b4600-install');
  });

  it('matches brand aliases', () => {
    expect(searchManuals('torquemaster').every((h) => h.brand.id === 'wayne-dalton')).toBe(true);
    expect(searchManuals('torquemaster').length).toBeGreaterThan(0);
  });

  it('filters by brand and returns everything for an empty search', () => {
    expect(searchManuals('').length).toBe(MANUAL_LINKS.length);
    const genie = searchManuals('', 'genie');
    expect(genie.length).toBeGreaterThan(0);
    expect(genie.every((h) => h.brand.id === 'genie')).toBe(true);
  });

  it('returns nothing for a model nobody makes', () => {
    expect(searchManuals('zzz999')).toEqual([]);
  });
});

describe('helpers', () => {
  it('formats the checked date', () => {
    expect(formatChecked('2026-11-10')).toBe('Nov 10, 2026');
    expect(formatChecked('soon')).toBe('soon');
  });

  it('calls any answer online and a failed connection offline', async () => {
    const answer = jest.fn().mockResolvedValue({ status: 405 });
    expect(await checkReach('https://example.com', answer as unknown as typeof fetch)).toBe('online');
    expect(answer).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ method: 'HEAD' }));
    const fail = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    expect(await checkReach('https://example.com', fail as unknown as typeof fetch)).toBe('offline');
  });
});

describe('Manuals screen', () => {
  it('opens the maker page when there is a signal', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200 }) as unknown as typeof fetch;
    const openUrl = jest.fn().mockResolvedValue(undefined);
    await render(<ManualsScreen fetchImpl={fetchImpl} openUrl={openUrl} />);
    await fireEvent.changeText(screen.getByTestId('manuals-search'), '628');
    await fireEvent.press(screen.getByTestId('manual-guardian-manuals'));
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith('https://adhguardianusa.com/service/manuals/'));
    expect(screen.queryByTestId('manuals-offline')).toBeNull();
  });

  it('says there is no signal instead of opening, and can open anyway', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
    const openUrl = jest.fn().mockResolvedValue(undefined);
    await render(<ManualsScreen fetchImpl={fetchImpl} openUrl={openUrl} />);
    await fireEvent.press(screen.getByTestId('manual-linear-manuals'));
    const banner = await screen.findByTestId('manuals-offline');
    expect(within(banner).getByText('No signal')).toBeTruthy();
    expect(openUrl).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('manuals-open-anyway'));
    expect(openUrl).toHaveBeenCalledWith('https://linear-solutions.com/manuals/');
  });

  it('shows a helpful empty state', async () => {
    await render(<ManualsScreen fetchImpl={jest.fn() as unknown as typeof fetch} openUrl={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('manuals-search'), 'zzz999');
    expect(screen.getByTestId('manuals-empty')).toBeTruthy();
    expect(screen.getByText('0 links')).toBeTruthy();
  });

  it('is reachable from the app header', async () => {
    await render(<App />);
    await fireEvent.press(screen.getByTestId('section-manuals'));
    expect(screen.getByTestId('manuals-search')).toBeTruthy();
    expect(screen.getAllByText('Manuals').length).toBeGreaterThan(0);
  });
});
