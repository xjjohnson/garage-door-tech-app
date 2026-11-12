import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { renderApp } from '../testing/renderApp';
import { DEFAULT_DOOR_FORM, DEFAULT_MATCH_FORM } from '../lib/forms';
import { createJob, Job, JOBS_STORAGE_KEY, parseJobs, phoneLink, searchJobs, sortJobs } from '../lib/jobs';

const DETAILS = { customer: '  Pat Smith ', address: '12 Oak St', phone: '(555) 010-2030', notes: 'Left side cable frayed' };

function job(over: Partial<Job> & { savedAt: number }): Job {
  return { ...createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, DETAILS, { title: '.225 × 2" × 24"' }, over.savedAt, `id-${over.savedAt}`), ...over } as Job;
}

describe('jobs (plain logic)', () => {
  it('trims the details and starts open', () => {
    const j = createJob({ mode: 'door', form: DEFAULT_DOOR_FORM }, DETAILS, { title: '3 pairs that fit', detail: 'Wind 7 1/2 turns' }, 1000, 'a');
    expect(j).toMatchObject({ id: 'a', customer: 'Pat Smith', status: 'open', mode: 'door', summaryDetail: 'Wind 7 1/2 turns', savedAt: 1000 });
  });

  it('sorts open jobs first, newest first', () => {
    const list = [job({ savedAt: 1 }), job({ savedAt: 3, status: 'done' }), job({ savedAt: 2 })];
    expect(sortJobs(list).map((j) => j.savedAt)).toEqual([2, 1, 3]);
  });

  it('searches names, addresses, phone and the spring, ignoring case, spaces and dashes', () => {
    const list = [job({ savedAt: 1 }), job({ savedAt: 2, customer: 'Lee', address: '4 Elm Rd', phone: '', notes: '', summaryTitle: '.250 × 2" × 30"' })];
    expect(searchJobs(list, 'smith').map((j) => j.savedAt)).toEqual([1]);
    expect(searchJobs(list, 'elm rd').map((j) => j.savedAt)).toEqual([2]);
    expect(searchJobs(list, '5550102030').map((j) => j.savedAt)).toEqual([1]);
    expect(searchJobs(list, '.250').map((j) => j.savedAt)).toEqual([2]);
    expect(searchJobs(list, '  ')).toHaveLength(2);
  });

  it('reads back what it saved, drops junk, and fills fields an older form lacked', () => {
    const good = job({ savedAt: 5 });
    const { trackRadius: _dropped, ...oldForm } = good.form as typeof DEFAULT_MATCH_FORM;
    const raw = JSON.stringify([{ ...good, form: oldForm }, null, 'x', { id: 'no-mode', savedAt: 1 }, { id: 'b', savedAt: 2, mode: 'door', status: 'weird' }]);
    const jobs = parseJobs(raw);
    expect(jobs.map((j) => j.id)).toEqual(['id-5', 'b']);
    expect(jobs[0].form).toEqual(DEFAULT_MATCH_FORM);
    expect(jobs[1]).toMatchObject({ status: 'open', customer: '', form: DEFAULT_DOOR_FORM });
    expect(parseJobs('not json')).toEqual([]);
    expect(parseJobs(null)).toEqual([]);
  });

  it('makes a dialable phone link, or none', () => {
    expect(phoneLink('(555) 010-2030')).toBe('tel:5550102030');
    expect(phoneLink('+1 555 010 2030')).toBe('tel:+15550102030');
    expect(phoneLink('n/a')).toBeUndefined();
  });
});

/** Open a field's keypad, press the keys, tap Done. */
async function enter(fieldTestId: string, keys: string[]) {
  await fireEvent.press(screen.getByTestId(fieldTestId));
  const pad = screen.getByTestId('keypad');
  for (const k of keys) await fireEvent.press(within(pad).getByTestId(`key-${k}`));
  await fireEvent.press(within(pad).getByTestId('keypad-done'));
}

async function storedJobs(): Promise<Job[]> {
  return parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY));
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('saved jobs in the app', () => {
  it('saves a spring result as a job, lists it, reopens it in the calculator and saves changes back', async () => {
    await renderApp('/springs');
    // No answer yet: nothing to save.
    expect(screen.getByTestId('job-save')).toBeDisabled();

    await enter('field-twenty', ['4', '1/2']);
    await enter('field-length', ['2', '4']);
    await fireEvent.press(screen.getByTestId('job-save'));
    const sheet = screen.getByTestId('job-sheet');
    // Needs a customer or an address.
    expect(within(sheet).getByTestId('job-sheet-save')).toBeDisabled();
    await fireEvent.changeText(within(sheet).getByTestId('job-customer'), 'Pat Smith');
    await fireEvent.changeText(within(sheet).getByTestId('job-address'), '12 Oak St');
    await fireEvent.changeText(within(sheet).getByTestId('job-phone'), '555 010 2030');
    await fireEvent.press(within(sheet).getByTestId('job-sheet-save'));
    expect(screen.getByTestId('job-saved')).toHaveTextContent('Saved to Jobs: Pat Smith');
    expect(screen.getByTestId('linked-job')).toHaveTextContent('Job: Pat Smith');

    expect(await storedJobs()).toHaveLength(1);
    const [saved] = await storedJobs();
    expect(saved).toMatchObject({ customer: 'Pat Smith', mode: 'match', summaryTitle: '.225 × 2" × 24"' });

    // Clearing the calculator unlinks it from the job.
    await fireEvent.press(screen.getByTestId('clear-match'));
    await fireEvent.press(screen.getByTestId('clear-match'));
    expect(screen.queryByTestId('linked-job')).toBeNull();

    await fireEvent.press(screen.getByTestId('section-jobs'));
    const card = screen.getByTestId(`job-${saved.id}`);
    expect(within(card).getByText('.225 × 2" × 24"')).toBeTruthy();
    expect(within(card).getByText('12 Oak St')).toBeTruthy();
    await fireEvent.press(within(card).getByTestId(`job-toggle-${saved.id}`));
    expect(within(card).getByTestId(`job-call-${saved.id}`)).toBeTruthy();
    await fireEvent.press(within(card).getByTestId(`job-open-${saved.id}`));

    // Back on the calculator with the job's inputs.
    const results = await screen.findByTestId('match-results');
    expect(within(results).getByText('.225 × 2" × 24"')).toBeTruthy();
    expect(screen.getByTestId('linked-job')).toHaveTextContent('Job: Pat Smith');

    await enter('field-length', ['back', 'back', '2', '6']);
    await fireEvent.press(screen.getByTestId('job-update'));
    expect((await storedJobs())[0].summaryTitle).toBe('.225 × 2" × 26"');
    expect((await storedJobs())[0].form).toMatchObject({ length: '26' });
  });

  it('edits, marks done and deletes (on a second tap) from the Jobs list', async () => {
    const saved = createJob({ mode: 'door', form: DEFAULT_DOOR_FORM }, { customer: 'Lee', address: '4 Elm Rd', phone: '', notes: '' }, { title: '3 pairs that fit' }, 1000, 'j1');
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([saved]));
    await renderApp('/springs');
    await fireEvent.press(screen.getByTestId('section-jobs'));
    await screen.findByTestId('job-j1');
    expect(screen.getByTestId('jobs-count')).toHaveTextContent('1 shown · 1 open');

    await fireEvent.press(screen.getByTestId('job-toggle-j1'));
    expect(screen.queryByTestId('job-call-j1')).toBeNull(); // no phone, no Call button
    await fireEvent.press(screen.getByTestId('job-edit-j1'));
    await fireEvent.changeText(within(screen.getByTestId('job-sheet')).getByTestId('job-notes'), 'Needs new rollers');
    await fireEvent.press(within(screen.getByTestId('job-sheet')).getByTestId('job-sheet-save'));
    expect(screen.getByText('Needs new rollers')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('job-status-j1'));
    // The Open filter now hides it; Done shows it.
    expect(screen.queryByTestId('job-j1')).toBeNull();
    await fireEvent.press(within(screen.getByTestId('jobs-filter')).getByText('Done'));
    expect(screen.getByTestId('job-j1')).toBeTruthy();
    expect((await storedJobs())[0]).toMatchObject({ status: 'done', notes: 'Needs new rollers' });

    // Still open from before.
    await fireEvent.press(screen.getByTestId('job-delete-j1'));
    expect(screen.getByTestId('job-j1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('job-delete-j1'));
    expect(screen.queryByTestId('job-j1')).toBeNull();
    expect(await storedJobs()).toEqual([]);
    expect(screen.getByTestId('jobs-empty')).toBeTruthy();
  });

  it('searches the list', async () => {
    const a = createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat Smith', address: '', phone: '', notes: '' }, { title: 'x' }, 1, 'a');
    const b = createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Lee Jones', address: '', phone: '', notes: '' }, { title: 'y' }, 2, 'b');
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([a, b]));
    await renderApp('/springs');
    await fireEvent.press(screen.getByTestId('section-jobs'));
    await screen.findByTestId('job-a');
    await fireEvent.changeText(screen.getByTestId('jobs-search'), 'jones');
    expect(screen.queryByTestId('job-a')).toBeNull();
    expect(screen.getByTestId('job-b')).toBeTruthy();
  });
});
