import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { Invoice, INVOICES_STORAGE_KEY } from '../lib/invoices';
import { createJob, Job, JOBS_STORAGE_KEY } from '../lib/jobs';
import { monthOf, percent, periodStats, snapshot, thisWeek } from '../lib/stats';
import { renderApp } from '../testing/renderApp';

const MATCH = { mode: 'match' as const, form: { ...DEFAULT_MATCH_FORM, twentyCoil: '4 1/2', length: '24' } };
// Wednesday, Nov 11 2026, noon.
const NOW = new Date(2026, 10, 11, 12).getTime();
const day = (d: number, m = 10) => new Date(2026, m, d, 10).getTime();

const job = (id: string, savedAt: number, extra: Partial<Job> = {}): Job => ({ ...createJob(MATCH, { customer: id, address: '', phone: '', notes: '' }, { title: 'x' }, savedAt, id), ...extra }) as Job;

const inv = (id: string, createdAt: number, total: number, payments: Invoice['payments'] = [], extra: Partial<Invoice> = {}): Invoice => ({
  id,
  number: id,
  jobId: id,
  billTo: `Cust ${id}`,
  address: '',
  tier: 'good',
  lines: [],
  subtotal: total,
  tax: 0,
  total,
  payments,
  createdAt,
  updatedAt: createdAt,
  ...extra,
});

const JOBS = [
  job('a', day(10), { accepted: { tier: 'good', total: 30000, at: day(10) } }),
  job('b', day(3)),
  job('c', day(20, 9), { status: 'done', accepted: { tier: 'best', total: 60000, at: day(21, 9) } }),
];
const INVOICES = [
  inv('1001', day(10), 30000, [{ id: 'p1', method: 'cashapp', amount: 10000, at: day(10), reference: '' }]),
  inv('1002', day(21, 9), 60000, [{ id: 'p2', method: 'check', amount: 60000, at: day(22, 9), reference: '7' }]),
  inv('1003', day(9), 99900, [], { voidedAt: day(9) }),
];

describe('business numbers (plain logic)', () => {
  it('finds this week (from Monday) and this month', () => {
    expect(new Date(thisWeek(NOW).start)).toEqual(new Date(2026, 10, 9));
    expect(new Date(monthOf(NOW).start)).toEqual(new Date(2026, 10, 1));
    expect(new Date(monthOf(NOW, -1).start)).toEqual(new Date(2026, 9, 1));
  });

  it('adds up a period, leaving void invoices out', () => {
    const m = periodStats(JOBS, INVOICES, monthOf(NOW));
    expect(m.collected).toBe(10000);
    expect(m.byMethod.cashapp).toBe(10000);
    expect(m.invoiced).toBe(30000);
    expect(m.invoices).toBe(1);
    expect(m.jobsSaved).toBe(2);
    expect(m.accepted).toBe(1);
    expect(percent(m.closeRate)).toBe('50%');
    expect(m.averageTicket).toBe(30000);
  });

  it('takes a snapshot: open jobs, what is owed, and six months of collections', () => {
    const s = snapshot(JOBS, INVOICES, NOW);
    expect(s.openJobs).toBe(2);
    expect(s.owed).toBe(20000);
    expect(s.oldestOwed?.id).toBe('1001');
    expect(s.week.collected).toBe(10000);
    expect(s.months).toHaveLength(6);
    expect(s.months.map((m) => m.collected).slice(-2)).toEqual([60000, 10000]);
  });
});

describe('business numbers in the app', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(JOBS));
    await AsyncStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(INVOICES));
  });

  it('shows the short version on Jobs and the full page behind it', async () => {
    const app = await renderApp('/jobs');
    for (let i = 0; i < 5; i++) await act(async () => undefined);
    expect(screen.getByTestId('stats-card')).toHaveTextContent(/2Open jobs/);
    expect(screen.getByTestId('stats-card')).toHaveTextContent(/\$200Owed to you/);
    await fireEvent.press(screen.getByTestId('stats-card'));
    expect(app.getPathname()).toBe('/stats');
    expect(screen.getByTestId('stats-oldest')).toHaveTextContent(/Oldest unpaid: 1001/);
    expect(screen.getByTestId('stats-chart')).toBeTruthy();
  });
});
