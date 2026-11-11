import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import App from '../../App';
import { BRANDS, MANUAL_LINKS } from '../data/manuals';
import { brandsFor, checkReach, formatChecked, linkMarkets, linkUrls, queryWords, searchManuals } from '../lib/manualSearch';
import { ManualsScreen } from '../screens/ManualsScreen';

describe('manual links data', () => {
  const brandIds = new Set(BRANDS.map((b) => b.id));

  it('covers every brand Justin picked', () => {
    for (const name of ['Clopay', 'Amarr', 'Wayne Dalton', 'C.H.I.', 'LiftMaster', 'Chamberlain', 'Genie', 'Linear', 'Marantec', 'Guardian', 'Overhead Door']) {
      const brand = BRANDS.find((b) => b.name === name);
      expect(brand).toBeDefined();
      expect(MANUAL_LINKS.some((l) => l.brand === brand!.id)).toBe(true);
    }
  });

  it('covers the commercial and gate makers from the plan', () => {
    for (const name of ['DoorKing', 'Rytec', 'Cornell Cookson', 'Chase Doors', 'BEA', 'LiftMaster', 'Overhead Door', 'Linear', 'Clopay']) {
      const brand = BRANDS.find((b) => b.name === name);
      expect(brand).toBeDefined();
      expect(MANUAL_LINKS.some((l) => l.brand === brand!.id && linkMarkets(l).includes('commercial'))).toBe(true);
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

  it("opens documents only from the maker's own site or its own file store", () => {
    for (const l of MANUAL_LINKS) {
      const brand = BRANDS.find((b) => b.id === l.brand)!;
      for (const d of l.docs ?? []) {
        const u = new URL(d.url);
        const ok = u.protocol === 'https:' && (brand.hosts.includes(u.hostname) || (brand.fileHosts ?? []).some((p) => d.url.startsWith(p)));
        expect({ id: l.id, url: d.url, ok }).toEqual({ id: l.id, url: d.url, ok: true });
      }
    }
    // A file store is named by the start of its address, over https, ending in a slash.
    for (const b of BRANDS) for (const p of b.fileHosts ?? []) expect(p).toMatch(/^https:\/\/[a-z0-9.-]+\/.*\/$/);
  });

  it('gives each document a label and no entry the same document twice', () => {
    for (const l of MANUAL_LINKS) {
      if (!l.docs) continue;
      expect(l.docs.length).toBeGreaterThan(0);
      const urls = linkUrls(l);
      expect({ id: l.id, unique: new Set(urls).size === urls.length }).toEqual({ id: l.id, unique: true });
      const labels = l.docs.map((d) => d.label);
      expect({ id: l.id, unique: new Set(labels).size === labels.length }).toEqual({ id: l.id, unique: true });
      for (const d of l.docs) expect(d.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('opens the documents Justin asked about straight from the LiftMaster T entry', () => {
    const t = MANUAL_LINKS.find((l) => l.id === 'liftmaster-commercial-logic5')!;
    expect(t.docs!.map((d) => d.label)).toEqual([
      'Install manual',
      'Install manual (Spanish)',
      "User's guide",
      "User's guide (Spanish)",
      'Quick start',
      'Quick start (Spanish)',
      'Commercial operators service guide',
    ]);
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
    expect(ids).toContain('linear-ldo-lso');
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

  it('finds older Marantec and Overhead Door openers by model number', () => {
    expect(searchManuals('M4500')[0].link.id).toBe('marantec-m4500-m4700');
    expect(searchManuals('m4500e')[0].link.id).toBe('marantec-m4500e-m4700e');
    expect(searchManuals('EX-2007')[0].link.id).toBe('marantec-ex2005-ex2007');
    expect(searchManuals('1029')[0].link.id).toBe('overhead-door-legacy-owner');
    expect(searchManuals('codedodger').map((h) => h.link.id)).toContain('overhead-door-keypad-programming');
    expect(searchManuals('2283').map((h) => h.link.id)).toContain('chi-document-finder');
  });

  it('splits residential from commercial and gate', () => {
    const commercial = searchManuals('', null, MANUAL_LINKS, 'commercial');
    const residential = searchManuals('', null, MANUAL_LINKS, 'residential');
    expect(commercial.every((h) => linkMarkets(h.link).includes('commercial'))).toBe(true);
    expect(residential.every((h) => linkMarkets(h.link).includes('residential'))).toBe(true);
    // Gate links count as commercial & gate; a link for both shows in both.
    expect(commercial.map((h) => h.link.id)).toEqual(expect.arrayContaining(['linear-gate-manuals', 'doorking-swing-gate', 'amarr-all-install']));
    expect(residential.map((h) => h.link.id)).toContain('amarr-all-install');
    expect(residential.map((h) => h.link.id)).not.toContain('doorking-swing-gate');
    expect(brandsFor('commercial').map((b) => b.id)).not.toContain('genie');
    expect(brandsFor(null).length).toBe(BRANDS.length);
  });

  it('finds commercial operators and gate gear by model', () => {
    expect(searchManuals('MH5011U')[0].link.id).toBe('liftmaster-commercial-medium-duty');
    expect(searchManuals('RHX').map((h) => h.link.id)).toEqual(expect.arrayContaining(['overhead-door-rhx-install', 'overhead-door-rhx-nema']));
    expect(searchManuals('6050')[0].link.id).toBe('doorking-6050-6100');
    expect(searchManuals('9024 solar')[0].link.id).toBe('doorking-9024');
    expect(searchManuals('ldco841 spanish')[0].link.id).toBe('linear-ldco841-863');
    expect(searchManuals('628')[0].link.id).toBe('guardian-628');
    expect(searchManuals('1835')[0].link.id).toBe('doorking-entry-systems');
    expect(searchManuals('turbo-seal')[0].link.id).toBe('rytec-documents');
    expect(searchManuals('commercial doorking').length).toBeGreaterThan(0);
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
    await fireEvent.changeText(screen.getByTestId('manuals-search'), 'B4613');
    await fireEvent.press(screen.getByTestId('manual-chamberlain-b4600-install'));
    await waitFor(() =>
      expect(openUrl).toHaveBeenCalledWith(
        'https://support.chamberlaingroup.com/s/article/Chamberlain-B4603TC-B4643TC-B4613TC-B6313TC-B6753TC-Installation-Manual-English-French',
      ),
    );
    expect(screen.queryByTestId('manuals-offline')).toBeNull();
  });

  it('opens a PDF straight from its own button, and the maker page from More documents', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200 }) as unknown as typeof fetch;
    const openUrl = jest.fn().mockResolvedValue(undefined);
    await render(<ManualsScreen fetchImpl={fetchImpl} openUrl={openUrl} />);
    await fireEvent.changeText(screen.getByTestId('manuals-search'), '628');
    const card = screen.getByTestId('manual-guardian-628');
    expect(within(card).getByText('628 manual')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('doc-guardian-628-0'));
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith('https://adhguardianusa.com/wp-content/uploads/2024/10/628_manual_20170929.pdf'));
    expect(fetchImpl).toHaveBeenCalledWith('https://adhguardianusa.com/wp-content/uploads/2024/10/628_manual_20170929.pdf', expect.objectContaining({ method: 'HEAD' }));
    await fireEvent.press(screen.getByTestId('more-guardian-628'));
    await waitFor(() => expect(openUrl).toHaveBeenLastCalledWith('https://adhguardianusa.com/service/manuals/'));
  });

  it('shows every LiftMaster Logic 5.0 document as its own button', async () => {
    await render(<ManualsScreen fetchImpl={jest.fn() as unknown as typeof fetch} openUrl={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('manuals-search'), 'logic 5');
    const t = MANUAL_LINKS.find((l) => l.id === 'liftmaster-commercial-logic5')!;
    t.docs!.forEach((d, n) => {
      expect(within(screen.getByTestId(`doc-liftmaster-commercial-logic5-${n}`)).getByText(d.label)).toBeTruthy();
    });
    expect(within(screen.getByTestId('more-liftmaster-commercial-logic5')).getByText("More documents on the maker's page")).toBeTruthy();
  });

  it('says there is no signal for a document too, and can open it anyway', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
    const openUrl = jest.fn().mockResolvedValue(undefined);
    await render(<ManualsScreen fetchImpl={fetchImpl} openUrl={openUrl} />);
    await fireEvent.changeText(screen.getByTestId('manuals-search'), '6050');
    await fireEvent.press(screen.getByTestId('doc-doorking-6050-6100-1'));
    const banner = await screen.findByTestId('manuals-offline');
    expect(within(banner).getByText(/www\.doorking\.com/)).toBeTruthy();
    expect(openUrl).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('manuals-open-anyway'));
    expect(openUrl).toHaveBeenCalledWith('https://www.doorking.com/wp-content/uploads/2018/08/6050-065-Z-9-24.pdf');
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

  it('narrows makers to the market picked', async () => {
    await render(<ManualsScreen fetchImpl={jest.fn() as unknown as typeof fetch} openUrl={jest.fn()} />);
    expect(within(screen.getByTestId('manuals-brands')).getByText('Genie')).toBeTruthy();
    await fireEvent.press(within(screen.getByTestId('manuals-market')).getByText('Commercial & gate'));
    expect(within(screen.getByTestId('manuals-brands')).queryByText('Genie')).toBeNull();
    expect(within(screen.getByTestId('manuals-brands')).getByText('DoorKing')).toBeTruthy();
    expect(screen.getByTestId('manual-doorking-slide-gate')).toBeTruthy();
    expect(screen.queryByTestId('manual-guardian-628')).toBeNull();
    expect(screen.getByTestId('manual-guardian-commercial')).toBeTruthy();
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
