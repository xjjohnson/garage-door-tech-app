import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen } from '@testing-library/react-native';
import { Customer, CUSTOMERS_STORAGE_KEY } from '../lib/customers';
import type { CustomersLayout, ToolsLayout } from '../lib/themes';
import { renderApp } from '../testing/renderApp';
import { layouts } from '../theme';

/** Customers and Tools draw the same things in each theme's arrangement. */
const original = { ...layouts };
afterEach(() => Object.assign(layouts, original));

const customer = (id: string, f: Partial<Customer>): Customer => ({ id, name: '', phone: '', email: '', address: '', notes: '', createdAt: 1, updatedAt: 1, ...f });

describe('Customers in each theme layout', () => {
  const cases: CustomersLayout[] = ['classic', 'big', 'table', 'owed', 'near'];
  for (const layout of cases) {
    it(`draws ${layout} and still lists the customer`, async () => {
      Object.assign(layouts, { customers: layout });
      await AsyncStorage.clear();
      await AsyncStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify([customer('c1', { name: 'Pat Lee', phone: '555-111-2222', address: '1 Elm St' }), customer('c2', { name: 'Ann Cruz' })]));
      await renderApp('/customers');
      expect(await screen.findByTestId('customer-c1')).toHaveTextContent(/Pat Lee/);
      expect(screen.getByTestId('customer-c2')).toHaveTextContent(/Ann Cruz/);
      if (layout === 'big') expect(screen.getByTestId('customer-call-c1')).toBeTruthy();
      if (layout === 'table') expect(screen.getByTestId('customers-table')).toBeTruthy();
      if (layout === 'owed') expect(screen.getByTestId('customers-owed-total')).toBeTruthy();
      if (layout === 'near') expect(screen.getByTestId('customers-near')).toBeTruthy();
    });
  }
});

describe('Tools in each theme layout', () => {
  const cases: ToolsLayout[] = ['classic', 'tiles', 'compact', 'business', 'calc'];
  for (const layout of cases) {
    it(`draws ${layout} with the spring calculator reachable`, async () => {
      Object.assign(layouts, { tools: layout });
      await AsyncStorage.clear();
      await renderApp('/tools');
      expect(await screen.findByTestId('tools-springs')).toBeTruthy();
      expect(screen.getByTestId('tools-price-book')).toBeTruthy();
      if (layout === 'tiles') expect(screen.getByTestId('open-time-log-tile')).toBeTruthy();
      if (layout === 'calc') expect(screen.getByTestId('tools-stock-big')).toBeTruthy();
    });
  }
});

describe('Job detail in each theme layout', () => {
  const { SCHEDULE_STORAGE_KEY } = require('../lib/schedule');
  const { fireEvent } = require('@testing-library/react-native');
  const cases = ['steps', 'assign', 'billing', 'directions'] as const;
  for (const layout of cases) {
    it(`draws ${layout} with the steps and the next action still there`, async () => {
      Object.assign(layouts, { jobDetail: layout });
      await AsyncStorage.clear();
      const appt = { id: 'a1', start: Date.now(), minutes: 60, name: 'Pat Lee', address: '1 Elm St', phone: '555-010-0100', what: 'Broken spring', status: 'booked', createdAt: 1, updatedAt: 1 };
      await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify([appt]));
      await renderApp();
      await fireEvent.press(await screen.findByTestId('today-next'));
      expect(await screen.findByTestId('job-steps')).toBeTruthy();
      expect(screen.getByTestId('job-next')).toBeTruthy();
      expect(screen.getByTestId('job-visit')).toBeTruthy();
      if (layout === 'assign') expect(screen.getByTestId('job-reassign')).toBeTruthy();
      if (layout === 'billing') expect(screen.getByTestId('job-money')).toBeTruthy();
      if (layout === 'directions') expect(screen.getByTestId('job-go')).toBeTruthy();
    });
  }
});

describe('Owner Home chart data', () => {
  it('gives seven days, oldest first, ending today, and counts a payment on its day', () => {
    const { snapshot, lastDays } = require('../lib/stats');
    const now = new Date(2026, 10, 19, 15).getTime();
    const days = lastDays(now);
    expect(days).toHaveLength(7);
    expect(new Date(days[6].start).getDate()).toBe(19);
    expect(new Date(days[0].start).getDate()).toBe(13);
    const inv = { id: 'i', total: 5000, createdAt: now, payments: [{ at: new Date(2026, 10, 18, 9).getTime(), amount: 5000, method: 'cash' }], lines: [] };
    const snap = snapshot([], [inv], now);
    expect(snap.days).toHaveLength(7);
    expect(snap.days[5].collected).toBe(5000);
    expect(snap.days[6].collected).toBe(0);
  });
});
