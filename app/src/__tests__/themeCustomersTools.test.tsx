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
