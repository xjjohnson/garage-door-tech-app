import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { renderApp } from '../testing/renderApp';
import { DIAG_BRANDS, DIAG_FAMILIES, DIAG_SAFETY, SYMPTOMS } from '../data/diagnostics';
import { familiesFor, findCode, hostOf } from '../lib/diagnose';
import { DiagnoseScreen } from '../screens/DiagnoseScreen';

const allSources = [...DIAG_FAMILIES.flatMap((f) => f.sources.map((s) => ({ owner: f.id, brand: f.brand, s }))), ...SYMPTOMS.flatMap((y) => y.sources.map((s) => ({ owner: y.id, brand: null, s })))];
const allHosts = new Set(DIAG_BRANDS.flatMap((b) => b.hosts));

describe('diagnostics data', () => {
  it('covers the brands from the plan', () => {
    for (const id of ['liftmaster', 'genie', 'linear']) expect(familiesFor(id).length).toBeGreaterThan(0);
  });

  it('has unique family ids, known brands, and unique codes in each family', () => {
    const ids = DIAG_FAMILIES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const brands = new Set(DIAG_BRANDS.map((b) => b.id));
    for (const f of DIAG_FAMILIES) {
      expect(brands.has(f.brand)).toBe(true);
      const codes = f.codes.map((c) => c.code);
      expect({ family: f.id, unique: new Set(codes).size === codes.length }).toEqual({ family: f.id, unique: true });
      expect(f.codes.length).toBeGreaterThan(0);
      expect(f.howToRead.length).toBeGreaterThan(20);
      expect(f.models.length).toBeGreaterThan(0);
    }
  });

  it('gives every code a meaning and at least one check, with no empty lines', () => {
    for (const f of DIAG_FAMILIES) {
      for (const c of f.codes) {
        expect(c.meaning.trim().length).toBeGreaterThan(0);
        expect(c.checks.length).toBeGreaterThan(0);
        for (const step of c.checks) expect(step.trim().length).toBeGreaterThan(5);
      }
    }
  });

  it("cites the maker's own website, over https, with a real checked date", () => {
    for (const { owner, brand, s } of allSources) {
      const u = new URL(s.url);
      expect(u.protocol).toBe('https:');
      // A family's sources must be its own maker's; a symptom may cite any maker in the list.
      const hosts = brand ? DIAG_BRANDS.find((b) => b.id === brand)!.hosts : [...allHosts];
      expect({ owner, host: u.hostname, ok: hosts.includes(u.hostname) }).toEqual({ owner, host: u.hostname, ok: true });
      expect(s.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(s.checked))).toBe(false);
      expect(s.title.length).toBeGreaterThan(0);
    }
    for (const f of DIAG_FAMILIES) expect(f.sources.length).toBeGreaterThan(0);
  });

  it('has the Security+ 2.0 codes techs see most, read the maker way', () => {
    expect(findCode('lm-sec2', '1-1')?.code.meaning).toMatch(/sensor/i);
    expect(findCode('lm-sec2', '4-1')?.code.meaning).toMatch(/closing/i);
    expect(findCode('lm-sec2', '1-5')?.code.meaning).toMatch(/RPM/);
    expect(findCode('lm-sec2', '1-6')?.code.pro).toBe(true);
    for (const c of findCode('lm-sec2', '1-1')!.family.codes) expect(c.code).toMatch(/^\d-\d( to \d-\d)?$/);
  });

  it('has the older learn-button LED, Genie, Linear and Guardian codes', () => {
    expect(findCode('lm-learn-led', '4 flashes')?.code.meaning).toMatch(/misaligned/i);
    expect(findCode('genie-excelerator', '8 blinks')?.code.meaning).toMatch(/locked/i);
    expect(findCode('genie-beam', 'Red 2 blinks, green on')).toBeDefined();
    expect(findCode('linear-ldo', '3 flashes')?.code.meaning).toMatch(/beam/i);
    expect(findCode('guardian-beeps', '20 beeps')?.code.meaning).toMatch(/photo eyes/i);
  });

  it('marks spring and cable fixes for a trained tech', () => {
    for (const [fam, code] of [
      ['lm-sec2', '3-5'],
      ['lm-sec2', '4-2'],
      ['lm-rjo', '9'],
    ]) {
      expect(findCode(fam, code)?.code.pro).toBe(true);
    }
  });

  it('has the generic symptom guide, each with checks and codes that exist', () => {
    const titles = SYMPTOMS.map((s) => s.title);
    for (const t of ["Won't close", 'Reverses or stops going down', "Hums or clicks, door doesn't move", "Remote doesn't work, wall button does", 'Lights flash or it beeps']) {
      expect(titles).toContain(t);
    }
    const ids = SYMPTOMS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SYMPTOMS) {
      expect(s.checks.length).toBeGreaterThan(2);
      expect(s.sources.length).toBeGreaterThan(0);
      for (const r of s.related) expect({ symptom: s.id, ...r, found: findCode(r.family, r.code) !== undefined }).toEqual({ symptom: s.id, ...r, found: true });
    }
  });

  it('puts the hums symptom check for a broken spring first', () => {
    const hums = SYMPTOMS.find((s) => s.id === 'hums')!;
    expect(hums.checks[0]).toMatch(/broken spring/i);
  });

  it('keeps the safety notes about springs and unplugging', () => {
    expect(DIAG_SAFETY.join(' ')).toMatch(/tension/);
    expect(DIAG_SAFETY.join(' ')).toMatch(/Unplug/);
  });

  it('reads the host from a link', () => {
    expect(hostOf('https://linear-solutions.com/wp-content/uploads/LDO.pdf')).toBe('linear-solutions.com');
  });
});

describe('Diagnose screen', () => {
  it('shows the safety notes first, with no way to close them', async () => {
    await render(<DiagnoseScreen openUrl={jest.fn()} />);
    const banner = screen.getByTestId('diagnose-safety');
    expect(within(banner).getByText('Safety first')).toBeTruthy();
    expect(screen.queryByText(/dismiss/i)).toBeNull();
  });

  it('by symptom: shows the checks in order and jumps to a related code', async () => {
    await render(<DiagnoseScreen openUrl={jest.fn()} />);
    await fireEvent.press(within(screen.getByTestId('diagnose-symptoms')).getByText("Won't close"));
    const card = screen.getByTestId('symptom-wont-close');
    expect(within(card).getByText('1.')).toBeTruthy();
    expect(within(card).getByText(SYMPTOMS[0].checks[0])).toBeTruthy();
    await fireEvent.press(screen.getByTestId('related-genie-beam-Red 2 blinks, green on'));
    expect(screen.getByTestId('diagnose-by-code')).toBeTruthy();
    expect(screen.getByTestId('code-genie-beam-Red 2 blinks, green on')).toBeTruthy();
  });

  it('by code: brand, family and code give the checks and the maker source', async () => {
    const openUrl = jest.fn().mockResolvedValue(undefined);
    await render(<DiagnoseScreen openUrl={openUrl} />);
    await fireEvent.press(within(screen.getByTestId('diagnose-mode')).getByText('By code'));
    // LiftMaster is first, Security+ 2.0 is its first family.
    await fireEvent.press(within(screen.getByTestId('diagnose-codes')).getByText('4-1'));
    const card = screen.getByTestId('code-lm-sec2-4-1');
    expect(within(card).getByText('Too much force while closing')).toBeTruthy();
    await fireEvent.press(within(card).getByTestId('source-https://support.chamberlaingroup.com/s/article/Knowledge/Garage-Door-Opener-Diagnostic-Codes'));
    expect(openUrl).toHaveBeenCalledWith('https://support.chamberlaingroup.com/s/article/Knowledge/Garage-Door-Opener-Diagnostic-Codes');
  });

  it('by code: switching brand resets the family and shows the spring warning where needed', async () => {
    await render(<DiagnoseScreen openUrl={jest.fn()} />);
    await fireEvent.press(within(screen.getByTestId('diagnose-mode')).getByText('By code'));
    await fireEvent.press(within(screen.getByTestId('diagnose-brands')).getByText('Linear'));
    expect(within(screen.getByTestId('diagnose-how-to-read')).getByText('LDO33 and LDO50')).toBeTruthy();
    await fireEvent.press(within(screen.getByTestId('diagnose-brands')).getByText('LiftMaster / Chamberlain'));
    await fireEvent.press(within(screen.getByTestId('diagnose-codes')).getByText('3-5'));
    expect(screen.getByTestId('diagnose-pro')).toBeTruthy();
    await fireEvent.press(within(screen.getByTestId('diagnose-codes')).getByText('1-1'));
    expect(screen.queryByTestId('diagnose-pro')).toBeNull();
  });

  it('is reachable from the app header', async () => {
    await renderApp();
    await fireEvent.press(screen.getByTestId('section-diagnose'));
    expect(screen.getByTestId('diagnose-safety')).toBeTruthy();
    expect(screen.getAllByText('Diagnose').length).toBeGreaterThan(0);
  });
});

describe('Diagnose in the app', () => {
  it('is not drawn until opened, then keeps its picks when switching away and back', async () => {
    await renderApp();
    expect(screen.queryByTestId('diagnose-safety')).toBeNull();
    await fireEvent.press(screen.getByTestId('section-diagnose'));
    await fireEvent.press(within(screen.getByTestId('diagnose-symptoms')).getByText("Won't close"));
    await fireEvent.press(screen.getByTestId('section-manuals'));
    await fireEvent.press(screen.getByTestId('section-diagnose'));
    expect(screen.getByTestId('symptom-wont-close')).toBeTruthy();
  });
});
