import { fireEvent, render, screen } from '@testing-library/react-native';
import { MaintenancePlans } from '../components/CustomerOdoo';
import { PlanPickSheet } from '../components/PlanSheets';
import { blankPlan, MaintenancePlan } from '../lib/maintenancePlans';
import { endText, ensureRenewalTodo, fetchPlanRenewals, isPlanAgreement, planOf, planRecords, planVisits } from '../lib/planRecords';
import type { AgreementRow, RepeatRow } from '../lib/odooRecurring';

const plans: MaintenancePlan[] = [
  { ...blankPlan(), id: 3, name: 'Twice-a-year service', noticeDays: 30 },
  { ...blankPlan(), id: 4, name: 'Yearly tune-up', priceCents: 12900 },
];
const agr = (id: number, f: Partial<AgreementRow>): AgreementRow => ({ id, name: 'Twice-a-year service', active: true, notes: 'Maintenance plan: Twice-a-year service. Plan #3.', ...f });
const rep = (id: number, f: Partial<RepeatRow>): RepeatRow => ({ id, name: `R${id}`, status: 'Active', active: true, agreementId: 1, ...f });
const TODAY = '2026-11-17';

describe('plan records', () => {
  it('finds plan agreements and which plan they came from', () => {
    expect(isPlanAgreement({ name: 'Other', notes: 'hi' }, plans)).toBe(false);
    expect(isPlanAgreement({ name: 'yearly TUNE-UP', notes: '' }, plans)).toBe(true);
    expect(planOf({ name: 'x', notes: 'Maintenance plan: x. Plan #9.' }, plans)).toBe(9);
    expect(planOf({ name: 'Yearly tune-up', notes: '' }, plans)).toBe(4);
  });

  it('says where each plan stands', () => {
    const rows = planRecords(
      [agr(1, { end: '2027-11-17' }), agr(2, { end: '2026-12-01' }), agr(3, { end: '2026-11-10' }), agr(4, { end: '2027-06-01' }), agr(5, { name: 'Other', notes: '' }), agr(6, { active: false })],
      [rep(10, { agreementId: 4, status: 'Paused' })],
      plans,
      TODAY,
    );
    const by = Object.fromEntries(rows.map((r) => [r.agreementId, r.status]));
    expect(by).toEqual({ 1: 'Active', 2: 'Ending soon', 3: 'Ended', 4: 'Paused' });
    expect(rows.find((r) => r.agreementId === 2)!.daysLeft).toBe(14);
    expect(endText(14)).toBe('Ends in 14 days');
    expect(endText(-1)).toBe('Ended 1 day ago');
    expect(endText(undefined)).toBe('No end date');
  });

  it('counts visits done and finds the next one', async () => {
    const c = {
      session: {} as never,
      call: async (_m: string, method: string) =>
        method === 'fields_get'
          ? { fsm_recurring_id: {}, scheduled_date_start: {}, stage_id: {}, is_closed: {} }
          : [
              { stage_id: [1, 'Completed'], is_closed: true, scheduled_date_start: '2026-05-01 10:00:00' },
              { stage_id: [2, 'New'], scheduled_date_start: '2027-04-10 10:00:00' },
              { stage_id: [2, 'New'], scheduled_date_start: '2027-05-10 10:00:00' },
            ],
    };
    expect(await planVisits(c, [rep(10, {})], TODAY)).toEqual({ done: 1, next: '2027-04-10' });
    const none = { session: {} as never, call: async (_m: string, method: string) => (method === 'fields_get' ? { name: {} } : []) };
    expect(await planVisits(none, [rep(10, { start: '2027-05-17 00:00:00' })], TODAY)).toEqual({ done: 0, next: '2027-05-17' });
  });

  it('lists plans about to end across customers, leaving out renewed ones', async () => {
    const calls: string[][] = [];
    const c = {
      session: { uid: 2 } as never,
      call: async (model: string, method: string, args: unknown[]) => {
        calls.push([model, method]);
        if (method === 'fields_get') return { end_date: {}, partner_id: {}, description: {}, active: {} };
        const dom = JSON.stringify(args[0]);
        if (dom.includes('"in"')) return [{ id: 9, name: 'Yearly tune-up', partner_id: [7, 'Sam'] }];
        return [
          { id: 1, name: 'Twice-a-year service', partner_id: [7, 'Sam'], end_date: '2026-12-01', description: '<p>Maintenance plan: Twice-a-year service. Plan #3.</p>', active: true },
          { id: 2, name: 'Yearly tune-up', partner_id: [7, 'Sam'], end_date: '2026-12-05', description: '<p>Maintenance plan: Yearly tune-up. Plan #4.</p>', active: true },
        ];
      },
    };
    const rows = await fetchPlanRenewals(c, plans, TODAY, '2027-01-16');
    expect(rows.map((r) => [r.agreementId, r.customer, r.partnerId, r.status])).toEqual([[1, 'Sam', 7, 'Ending soon']]);
  });

  it('makes a renewal to-do once', async () => {
    const made: unknown[] = [];
    let existing: number[] = [];
    const c = {
      session: { uid: 2 } as never,
      call: async (model: string, method: string, args: unknown[]) => {
        if (model === 'mail.activity' && method === 'search') return existing;
        if (model === 'ir.model') return [5];
        if (model === 'ir.model.data') return [{ res_id: 8 }];
        if (model === 'mail.activity' && method === 'create') {
          made.push(args[0]);
          return 77;
        }
        return [];
      },
    };
    const r = { agreementId: 1, name: 'Yearly tune-up', end: '2026-12-01', customer: 'Sam' };
    expect(await ensureRenewalTodo(c, 7, r)).toBe(77);
    expect(made[0]).toMatchObject({ res_id: 7, summary: 'Renew Yearly tune-up', date_deadline: '2026-12-01' });
    expect(JSON.stringify(made[0])).toContain('johnsons-plan-renewal:1:2026-12-01');
    existing = [55];
    expect(await ensureRenewalTodo(c, 7, r)).toBe(55);
    expect(made).toHaveLength(1);
  });
});

describe('customer plans section', () => {
  const handlers = { onPause: jest.fn(), onResume: jest.fn(), onCancel: jest.fn(), onChange: jest.fn(), onRenew: jest.fn() };
  const records = planRecords([agr(1, { start: '2026-01-01', end: '2026-12-01' }), agr(2, { name: 'Yearly tune-up', notes: 'Maintenance plan: Yearly tune-up. Plan #4.', end: '2027-09-01' })], [rep(10, {}), rep(11, { agreementId: 2 })], plans, TODAY);
  beforeEach(() => jest.clearAllMocks());

  it('shows an ending plan with Renew, and the actions', async () => {
    await render(<MaintenancePlans records={records} visits={{ 2: { done: 1, next: '2027-03-01' } }} plans={plans} busy={false} {...handlers} />);
    expect(screen.getByTestId('customer-plan-notice-1')).toHaveTextContent(/Ends in 14 days/);
    await fireEvent.press(screen.getByTestId('customer-plan-renew-1'));
    expect(handlers.onRenew).toHaveBeenCalledWith(plans[0]);
    expect(screen.queryByTestId('customer-plan-renew-2')).toBeNull();
    expect(screen.getByText('Next visit 2027-03-01')).toBeTruthy();
    expect(screen.getByText('1 visit done')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('customer-plan-pause-2'));
    await fireEvent.press(screen.getByTestId('customer-plan-cancel-2'));
    await fireEvent.press(screen.getByTestId('customer-plan-change-2'));
    expect([handlers.onPause, handlers.onCancel, handlers.onChange].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('shows nothing without plans', async () => {
    await render(<MaintenancePlans records={[]} visits={{}} plans={plans} busy={false} {...handlers} />);
    expect(screen.queryByText('Maintenance plans')).toBeNull();
  });

  it('picks a plan from the sheet', async () => {
    const onPick = jest.fn();
    await render(<PlanPickSheet visible title="Add" plans={plans} onPick={onPick} onCancel={() => undefined} />);
    await fireEvent.press(screen.getByTestId('plan-pick-4'));
    expect(onPick).toHaveBeenCalledWith(plans[1]);
  });
});
