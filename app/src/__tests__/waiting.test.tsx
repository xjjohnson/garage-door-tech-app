import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { CUSTOMERS_STORAGE_KEY } from '../lib/customers';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { createJob, JOBS_STORAGE_KEY } from '../lib/jobs';
import { pendingItems, pendingSync } from '../lib/pending';
import { onSyncNow, requestSyncNow } from '../lib/syncNow';
import { renderApp } from '../testing/renderApp';

const job = (id: string, over: object = {}) => ({ ...createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat Lee', address: '12 Elm St, Buda', phone: '', notes: '' }, { title: '' }, 1000, id), ...over });
const quoted = job('q1', { what: 'Off track', accepted: { tier: 'better', total: 42000, at: 2000 }, odooJob: { model: 'fsm.order', id: 5, name: 'FSO/5' } });

describe('what is waiting for Odoo', () => {
  it('lists the records the badge counts', () => {
    const cust = { id: 'c1', name: 'Sam', phone: '', email: '', address: '', notes: '', createdAt: 1, updatedAt: 1 };
    const it = pendingItems([cust], [quoted, job('j2', { accepted: { tier: 'good', total: 1, at: 1 }, odooOrder: { id: 9, name: 'S9' } })], [], 0);
    expect(it.quotes.map((j) => j.id)).toEqual(['q1']);
    expect(it.customers.map((c) => c.id)).toEqual(['c1']);
    expect(pendingSync([cust], [quoted], [], 0)).toMatchObject({ quotes: 1, customers: 1 });
  });

  it('Sync now runs every background sync once and waits for them', async () => {
    const ran: string[] = [];
    const off1 = onSyncNow(async () => void ran.push('jobs'));
    const off2 = onSyncNow(() => {
      ran.push('photos');
      throw new Error('no signal');
    });
    await requestSyncNow();
    off1();
    await requestSyncNow();
    off2();
    expect(ran).toEqual(['jobs', 'photos', 'photos']);
  });

  it('shows each waiting item and opens it', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([quoted]));
    await AsyncStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify([{ id: 'c1', name: 'Sam Ortiz', phone: '', email: '', address: '9 Oak Ave', notes: '', createdAt: 1, updatedAt: 1 }]));
    const app = await renderApp('/odoo-waiting');
    for (let i = 0; i < 6; i++) await act(async () => undefined);
    expect(screen.getByTestId('waiting-quote-q1')).toHaveTextContent(/Pat Lee · Better \$420.*Off track · 12 Elm St, Buda.*Send to Odoo as a sales order/);
    expect(screen.getByTestId('waiting-customer-c1')).toHaveTextContent(/Sam Ortiz.*New on this phone/);
    expect(screen.getByTestId('waiting-signin')).toHaveTextContent('Sign in to Odoo to sync');
    await fireEvent.press(screen.getByTestId('waiting-quote-q1'));
    expect(app.getPathname()).toBe('/quote/q1');
  });
});
