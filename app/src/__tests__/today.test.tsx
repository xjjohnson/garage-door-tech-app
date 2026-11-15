import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { log } from '../lib/log';
import { parseSchedule, SCHEDULE_STORAGE_KEY, startOfDay } from '../lib/schedule';
import { renderApp } from '../testing/renderApp';

let openURL: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

afterEach(() => {
  openURL.mockRestore();
});

describe('Today', () => {
  it('opens on Today, says Odoo is not connected, and offers the schedule on an empty day', async () => {
    const app = await renderApp();
    expect(app.getPathname()).toBe('/');
    expect(screen.getByTestId('today')).toBeTruthy();
    expect(screen.getByTestId('today-sync')).toHaveTextContent(/Not connected to Odoo/);
    expect(screen.getByTestId('today-count')).toHaveTextContent('Nothing booked today');
    await fireEvent.press(screen.getByTestId('today-schedule'));
    expect(app.getPathname()).toBe('/schedule');
  });

  it("starts the next visit as a job and ties it to the appointment", async () => {
    const start = Date.now();
    const appt = { id: 'a1', start, minutes: 60, name: 'Pat Lee', address: '1 Elm St', phone: '555-010-0100', what: 'Broken spring', status: 'booked', createdAt: 1, updatedAt: 1 };
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify([appt]));
    const app = await renderApp();
    expect(await screen.findByTestId('today-next')).toHaveTextContent(/Pat Lee/);
    await fireEvent.press(screen.getByTestId('today-next'));
    expect(app.getPathname()).toMatch(/^\/job\//);
    expect(screen.getByTestId('job-hub-title')).toHaveTextContent(/Pat Lee|Broken spring/);
    const saved = parseSchedule(await AsyncStorage.getItem(SCHEDULE_STORAGE_KEY));
    expect(saved[0].jobId).toBeTruthy();
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].id).toBe(saved[0].jobId);
  });
});

describe('Home page: Today, Week and Map', () => {
  const appt = (id: string, start: number, name: string, status = 'booked') => ({ id, start, minutes: 60, name, address: '1 Elm St', phone: '', what: 'Broken spring', status, createdAt: 1, updatedAt: 1 });

  it("shows the day's numbers and the four status steps on the next visit", async () => {
    const start = Date.now() + 60_000;
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify([appt('a1', start, 'Pat Lee'), appt('a2', startOfDay(start) + 60_000, 'Dana Cruz', 'done')]));
    await renderApp();
    expect(await screen.findByTestId('today-kpi-done')).toHaveTextContent(/^1 \/ 2/);
    expect(screen.getByTestId('today-kpi-collected')).toHaveTextContent(/^\$0/);
    expect(screen.getByTestId('today-steps-a1')).toHaveTextContent(/On my way.*Arrived.*Work done.*Paid/);
    expect(within(screen.getByTestId('today-steps-a1')).getByLabelText('On my way, next')).toBeTruthy();
  });

  it('Week has seven day chips with visit counts and shows the picked day with its times', async () => {
    const start = Date.now() + 86_400_000;
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify([appt('a1', start, 'Pat Lee'), appt('a2', start + 1_000, 'Dana Cruz')]));
    await renderApp();
    await fireEvent.press(within(screen.getByTestId('today-view')).getByText('Week'));
    expect(await screen.findByTestId('week-days')).toBeTruthy();
    expect(screen.getByTestId('week-count')).toHaveTextContent('Nothing booked');
    expect(screen.getByTestId('day-1').props.accessibilityLabel).toMatch(/2 visits/);
    await fireEvent.press(screen.getByTestId('day-1'));
    expect(screen.getByTestId('week-count')).toHaveTextContent('2 visits');
    expect(screen.getByTestId('week-visit-a1')).toHaveTextContent(/Pat Lee/);
    expect(screen.getByTestId('week-wrap-up')).toBeTruthy();
  });
});

describe('new job and the job hub', () => {
  it('makes a job in three answers and walks its steps', async () => {
    const app = await renderApp('/jobs');
    await fireEvent.press(screen.getByTestId('jobs-new-job'));
    expect(app.getPathname()).toBe('/new-job');
    await fireEvent.changeText(screen.getByTestId('new-job-name'), 'Sam Ortiz');
    await fireEvent.changeText(screen.getByTestId('new-job-address'), '9 Oak Ave');
    await fireEvent.changeText(screen.getByTestId('new-job-phone'), '555 222 3333');
    await fireEvent.press(screen.getByText('Opener'));
    await fireEvent.press(screen.getByTestId('new-job-start'));
    expect(app.getPathname()).toMatch(/^\/job\//);

    const job = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0];
    expect(job).toEqual(expect.objectContaining({ customer: 'Sam Ortiz', address: '9 Oak Ave', what: 'Opener' }));

    expect(screen.getByTestId('job-step-onMyWay').props.accessibilityLabel).toBe('On my way, next');
    await fireEvent.press(screen.getByTestId('job-next'));
    // It asks how many minutes away first: pick from the list, or Custom and type any number.
    await fireEvent.press(screen.getByTestId('job-omw-custom'));
    await fireEvent.changeText(screen.getByTestId('job-omw-custom-input'), '25');
    await fireEvent.press(screen.getByTestId('job-omw-custom-send'));
    expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/^sms:5552223333\?body=Hi%20Sam.*25%20minutes/));
    expect(screen.getByTestId('job-step-onMyWay').props.accessibilityLabel).toBe('On my way, done');

    await fireEvent.press(screen.getByTestId('job-next'));
    expect(screen.getByTestId('job-step-arrived').props.accessibilityLabel).toBe('Arrived, done');
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].steps?.arrivedAt).toEqual(expect.any(Number));
  });

  it('needs a name or an address before it starts', async () => {
    await renderApp('/new-job');
    expect(screen.getByTestId('new-job-start')).toBeDisabled();
  });
});

describe('hidden Developer screen and setup check', () => {
  it('opens after 7 taps on the version and shows the log', async () => {
    log.info('test', 'hello from the test');
    const app = await renderApp('/settings');
    for (let i = 0; i < 6; i++) await fireEvent.press(screen.getByTestId('settings-version'));
    expect(app.getPathname()).toBe('/settings');
    await fireEvent.press(screen.getByTestId('settings-version'));
    expect(app.getPathname()).toBe('/developer');
    expect(screen.getByTestId('dev-log')).toHaveTextContent(/hello from the test/);
  });

  it('the setup check says to sign in first', async () => {
    await renderApp('/setup');
    expect(await screen.findByTestId('setup-signin-missing')).toBeTruthy();
    expect(screen.getByTestId('setup-summary')).toHaveTextContent('1 missing.');
  });

  it('Developer links to the setup check', async () => {
    const app = await renderApp('/developer');
    await fireEvent.press(screen.getByTestId('dev-setup'));
    expect(app.getPathname()).toBe('/setup');
  });
});
