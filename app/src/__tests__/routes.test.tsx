import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { createJob, JOBS_STORAGE_KEY } from '../lib/jobs';
import { renderApp } from '../testing/renderApp';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('screens and routes', () => {
  it('each bottom button opens its section at its own address, with its title', async () => {
    const app = await renderApp();
    expect(app.getPathname()).toBe('/');
    expect(screen.getByTestId('section-today')).toBeSelected();
    for (const [id, path, title] of [
      ['jobs', '/jobs', 'Jobs'],
      ['sales', '/sales', 'Sales'],
      ['customers', '/customers', 'Customers'],
      ['tools', '/tools', 'Tools'],
      ['today', '/', 'Today'],
    ] as const) {
      await fireEvent.press(screen.getByTestId(`section-${id}`));
      expect(app.getPathname()).toBe(path);
      expect(screen.getByTestId(`section-${id}`)).toBeSelected();
      expect(screen.getByRole('header', { name: title })).toBeTruthy();
    }
  });

  it('opens tool pages from Tools, keeps Tools lit, and goes back to Tools', async () => {
    const app = await renderApp('/tools');
    for (const [id, path, title] of [
      ['springs', '/springs', 'Spring calculator'],
      ['manuals', '/manuals', 'Manuals'],
      ['diagnose', '/diagnose', 'Diagnose'],
    ] as const) {
      await fireEvent.press(screen.getByTestId(`tools-${id}`));
      expect(app.getPathname()).toBe(path);
      expect(screen.getByTestId('section-tools')).toBeSelected();
      expect(screen.getByRole('header', { name: title })).toBeTruthy();
      await fireEvent.press(screen.getByTestId('back-to-tools'));
      expect(app.getPathname()).toBe('/tools');
    }
  });

  it('opens a quote straight from its address, and says so when the job is gone', async () => {
    const job = createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat', address: '', phone: '', notes: '' }, { title: 'x' }, 1, 'j1');
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job]));
    const app = await renderApp('/quote/j1');
    expect(app.getPathname()).toBe('/quote/j1');
    expect(await screen.findByTestId('quote')).toBeTruthy();

    const gone = await renderApp('/quote/nope');
    expect(gone.getPathname()).toBe('/quote/nope');
    expect(await screen.findByText("That job isn't saved on this phone any more.")).toBeTruthy();
  });

  it('opens the price book as its own page and goes back with Close', async () => {
    const app = await renderApp('/jobs');
    await fireEvent.press(screen.getByTestId('open-price-book'));
    expect(app.getPathname()).toBe('/price-book');
    await fireEvent.press(screen.getByTestId('price-book-page-close'));
    expect(app.getPathname()).toBe('/jobs');
  });
});
