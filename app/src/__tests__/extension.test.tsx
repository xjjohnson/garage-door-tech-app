import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { renderApp } from '../testing/renderApp';
import { buildExtensionInput, DEFAULT_EXTENSION_FORM, runExtension } from '../lib/forms';
import { createJob, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';

describe('extension form (plain logic)', () => {
  it('needs a height and a weight, tag or color', () => {
    expect(buildExtensionInput(DEFAULT_EXTENSION_FORM).missing).toEqual(['Door weight, or the old springs’ tag or color']);
    expect(buildExtensionInput({ ...DEFAULT_EXTENSION_FORM, heightChoice: 'other' }).missing).toHaveLength(2);
  });
  it('sizes from the weight', () => {
    const out = runExtension({ ...DEFAULT_EXTENSION_FORM, weight: '147', oldColor: 'Blue', oldLength: '25' });
    expect(out.status).toBe('ok');
    if (out.status === 'ok') expect(out.result.perSide).toEqual([{ ratingLb: 140, color: 'Blue' }]);
  });
  it('turns a bad tag into an error, not a crash', () => {
    expect(runExtension({ ...DEFAULT_EXTENSION_FORM, oldRating: '145' }).status).toBe('error');
  });
  it('saves and reads back an extension job', () => {
    const j = createJob({ mode: 'extension', form: { ...DEFAULT_EXTENSION_FORM, weight: '140' } }, { customer: 'Lee', address: '', phone: '', notes: '' }, { title: '2 × 140 lb Blue' }, 5, 'e1');
    const [back] = parseJobs(JSON.stringify([j]));
    expect(back).toMatchObject({ id: 'e1', mode: 'extension', form: { weight: '140', springsPerSide: 1 } });
  });
});

async function keypad(keys: string[]) {
  const pad = screen.getByTestId('keypad');
  for (const k of keys) await fireEvent.press(within(pad).getByTestId(`key-${k}`));
  await fireEvent.press(within(pad).getByTestId('keypad-done'));
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('extension tab in the app', () => {
  it('sizes a door and shows the answer in the bar', async () => {
    await renderApp('/springs');
    await fireEvent.press(screen.getByTestId('tab-extension'));
    expect(screen.getByTestId('ext-bar')).toHaveTextContent(/Enter door weight/);
    await fireEvent.press(screen.getByTestId('field-ext-weight'));
    await keypad(['1', '4', '7']);
    expect(screen.getByTestId('ext-bar')).toHaveTextContent(/2 × 140 lb Blue/);
    expect(screen.getByTestId('ext-bar-detail')).toHaveTextContent('25" × 42" · from the door weight');
    expect(screen.getByTestId('card-ext')).toBeTruthy();
  });

  it('a color alone is a STOP with the ratings it could be', async () => {
    await renderApp('/springs');
    await fireEvent.press(screen.getByTestId('tab-extension'));
    await fireEvent.press(within(screen.getByTestId('ext-color')).getByText('Tan'));
    expect(screen.getByTestId('ext-bar')).toHaveTextContent(/STOP/);
    expect(screen.getByTestId('card-ext-candidates')).toHaveTextContent(/100 lb · 200 lb · 300 lb/);
  });

  it('opens a saved extension job on its tab', async () => {
    const job = createJob({ mode: 'extension', form: { ...DEFAULT_EXTENSION_FORM, weight: '120' } }, { customer: 'Lee', address: '', phone: '', notes: '' }, { title: '2 × 120 lb Green' }, 1000, 'e1');
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job]));
    await renderApp('/springs');
    await fireEvent.press(screen.getByTestId('section-jobs'));
    await fireEvent.press(await screen.findByTestId('job-toggle-e1'));
    expect(screen.getByText(/Extension springs/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('job-open-e1'));
    expect(await screen.findByTestId('ext-bar')).toHaveTextContent(/2 × 120 lb Green/);
    expect(screen.getByTestId('linked-job')).toHaveTextContent('Job: Lee');
  });
});
