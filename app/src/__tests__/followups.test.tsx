import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { CUSTOMERS_STORAGE_KEY } from '../lib/customers';
import { addMonths, DAY, DEFAULT_FOLLOW_UP, FOLLOW_UPS_STORAGE_KEY, followUpId, followUps, parseFollowUpStore, springsWornOutAt, textLink, warrantyFor } from '../lib/followups';
import { Invoice, INVOICES_STORAGE_KEY } from '../lib/invoices';
import { renderApp } from '../testing/renderApp';

const NOW = new Date(2026, 10, 11, 12).getTime();
const BIZ = { name: 'Ace Doors', phone: '' };

const inv = (id: string, createdAt: number, extra: Partial<Invoice> = {}): Invoice => ({
  id,
  number: id,
  jobId: `job-${id}`,
  customerId: `c-${id}`,
  billTo: 'Pat Smith',
  address: `${id} Oak St`,
  tier: 'good',
  lines: [],
  subtotal: 10000,
  tax: 0,
  total: 10000,
  payments: [],
  createdAt,
  updatedAt: createdAt,
  ...extra,
});

describe('follow-ups (plain logic)', () => {
  it('works out warranty and spring life', () => {
    const i = inv('1', new Date(2026, 0, 15).getTime(), { tier: 'better' });
    const w = warrantyFor(i, DEFAULT_FOLLOW_UP);
    expect(new Date(w.partsUntil!)).toEqual(new Date(addMonths(i.createdAt, 36)));
    expect(w.laborUntil).toBe(i.createdAt + 365 * DAY);
    // 25,000 cycles at 4 a day is 6,250 days, about 17 years.
    expect(Math.round((springsWornOutAt(i, DEFAULT_FOLLOW_UP) - i.createdAt) / DAY)).toBe(6250);
    expect(warrantyFor(i, { ...DEFAULT_FOLLOW_UP, warrantyMonths: { good: 0, better: 0, best: 0 }, laborWarrantyDays: 0 })).toEqual({ partsUntil: null, laborUntil: null });
  });

  it('lets each job pick its own warranty', () => {
    const i = inv('1', new Date(2026, 0, 15).getTime(), { tier: 'better', warranty: { partsMonths: 0, laborDays: 90 } });
    const w = warrantyFor(i, DEFAULT_FOLLOW_UP);
    expect(w.partsUntil).toBeNull();
    expect(w.laborUntil).toBe(i.createdAt + 90 * DAY);
    // 25,000 cycles at 8 a day (the setting) is 3,125 days.
    expect(Math.round((springsWornOutAt(i, { ...DEFAULT_FOLLOW_UP, cyclesPerDay: 8 }) - i.createdAt) / DAY)).toBe(3125);
    // A ticket has no parts warranty unless the job picks one.
    const t = inv('t', 1000, { source: 'ticket' });
    expect(warrantyFor(t, DEFAULT_FOLLOW_UP).partsUntil).toBeNull();
    expect(warrantyFor({ ...t, warranty: { partsMonths: 12 } }, DEFAULT_FOLLOW_UP).partsUntil).toBe(addMonths(1000, 12));
  });

  it('lists warranties ending soon, soonest first, and leaves out void and handled ones', () => {
    const endsSoon = addMonths(NOW, -12) + 20 * DAY;
    const list = followUps([inv('a', endsSoon), inv('b', endsSoon - 3 * DAY), inv('v', endsSoon, { voidedAt: 1 })], DEFAULT_FOLLOW_UP, BIZ, NOW);
    expect(list.map((f) => [f.kind, f.invoice.id])).toEqual([
      ['warranty', 'b'],
      ['warranty', 'a'],
    ]);
    expect(list[0].message).toMatch(/^Hi Pat, it's Ace Doors\./);
    const after = followUps([inv('a', endsSoon)], DEFAULT_FOLLOW_UP, BIZ, NOW, { [followUpId('warranty', inv('a', 0))]: NOW });
    expect(after).toEqual([]);
    // No tune-up reminders any more: those are recurring visits.
    expect(followUps([inv('c', addMonths(NOW, -12) + 5 * DAY, { tier: 'best' })], DEFAULT_FOLLOW_UP, BIZ, NOW)).toEqual([]);
  });

  it('flags worn springs at heavy use, and the warranty ending', () => {
    // 10,000 cycles at 20 a day is 500 days; flagged 180 days early.
    const heavy = { ...DEFAULT_FOLLOW_UP, cyclesPerDay: 20 };
    const i = inv('a', NOW - 320 * DAY);
    expect(followUps([i], heavy, BIZ, NOW).map((f) => f.kind)).toContain('springs');
    // Good warranty is 12 months; flagged 30 days before.
    const w = inv('w', addMonths(NOW, -12) + 20 * DAY);
    expect(followUps([w], DEFAULT_FOLLOW_UP, BIZ, NOW).map((f) => f.kind)).toEqual(['warranty']);
  });

  it('counts only the latest invoice at an address', () => {
    const old = inv('old', addMonths(NOW, -12), { customerId: 'c', address: '1 Elm' });
    const recent = inv('new', NOW - 10 * DAY, { customerId: 'c', address: '1 Elm' });
    expect(followUps([old, recent], DEFAULT_FOLLOW_UP, BIZ, NOW)).toEqual([]);
  });

  it('makes a text link and reads saved settings safely', () => {
    expect(textLink('(555) 123-4567', 'Hi there')).toBe('sms:5551234567?body=Hi%20there');
    expect(textLink('', 'x')).toBeUndefined();
    expect(parseFollowUpStore('junk')).toEqual({ settings: DEFAULT_FOLLOW_UP, dismissed: {}, activities: {} });
    expect(parseFollowUpStore({ settings: { cyclesPerDay: 6, warrantyMonths: { best: 120 } }, dismissed: { a: 1, b: 'x' } })).toEqual({
      settings: { ...DEFAULT_FOLLOW_UP, cyclesPerDay: 6, warrantyMonths: { ...DEFAULT_FOLLOW_UP.warrantyMonths, best: 120 } },
      dismissed: { a: 1 },
      activities: {},
    });
  });
});

describe('follow-ups in the app', () => {
  it('shows what is due on Jobs, texts the customer, and marks it done', async () => {
    const now = Date.now();
    const i = inv('1001', addMonths(now, -12) + 20 * DAY);
    await AsyncStorage.clear();
    await AsyncStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify([i]));
    await AsyncStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify([{ id: 'c-1001', name: 'Pat Smith', phone: '555-123-4567', email: '', address: '', notes: '', createdAt: 1, updatedAt: 1 }]));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const app = await renderApp('/jobs');
    for (let k = 0; k < 5; k++) await act(async () => undefined);
    expect(screen.getByTestId('open-followups')).toHaveTextContent('Follow-ups: 1 due');
    await fireEvent.press(screen.getByTestId('open-followups'));
    expect(app.getPathname()).toBe('/follow-ups');
    const id = followUpId('warranty', i);
    await fireEvent.press(screen.getByTestId(`followup-text-${id}`));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^sms:5551234567\?body=Hi%20Pat/));
    await fireEvent.press(screen.getByTestId(`followup-done-${id}`));
    expect(screen.getByTestId('followups-empty')).toBeTruthy();
    for (let k = 0; k < 3; k++) await act(async () => undefined);
    expect(parseFollowUpStore(await AsyncStorage.getItem(FOLLOW_UPS_STORAGE_KEY)).dismissed[id]).toBeGreaterThan(0);
    open.mockRestore();
  });
});
