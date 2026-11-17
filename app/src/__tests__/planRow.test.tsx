import { fireEvent, render, screen } from '@testing-library/react-native';
import { PlanRow, toTicketPlan } from '../components/PlanRow';
import { blankPlan, MaintenancePlan } from '../lib/maintenancePlans';

const plans: MaintenancePlan[] = [
  { ...blankPlan(), id: 1, name: 'Yearly tune-up' },
  { ...blankPlan(), id: 2, name: 'Twice-a-year service', everyMonths: 6, priceCents: 15000 },
];
const base = { plans, locked: false, done: false, onChange: jest.fn(), onRetry: jest.fn() };

describe('Ticket plan row', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stays on None until tapped, then picks a plan', async () => {
    await render(<PlanRow {...base} />);
    expect(screen.getByTestId('ticket-plan-current')).toHaveTextContent('None');
    await fireEvent.press(screen.getByTestId('ticket-plan-open'));
    await fireEvent.press(screen.getByTestId('ticket-plan-pick-2'));
    expect(base.onChange).toHaveBeenCalledWith(toTicketPlan(plans[1]));
  });

  it('shows nothing with no plans, and what the customer is already on', async () => {
    const { rerender } = await render(<PlanRow {...base} plans={[]} />);
    expect(screen.queryByTestId('ticket-plan')).toBeNull();
    await rerender(<PlanRow {...base} plans={[]} active={{ name: 'Yearly tune-up', end: '2027-03-01' }} />);
    expect(screen.getByTestId('ticket-plan-active')).toHaveTextContent('On Yearly tune-up until 2027-03-01');
  });

  it('shows a failed set-up with a retry', async () => {
    await render(<PlanRow {...base} plan={toTicketPlan(plans[0])} error="Odoo said no" />);
    expect(screen.getByTestId('ticket-plan-error')).toHaveTextContent(/Odoo said no/);
    await fireEvent.press(screen.getByTestId('ticket-plan-retry'));
    expect(base.onRetry).toHaveBeenCalled();
  });

  it('shows done and hides the picker once set up', async () => {
    await render(<PlanRow {...base} plan={toTicketPlan(plans[0])} done />);
    expect(screen.getByTestId('ticket-plan-done')).toBeTruthy();
    expect(screen.queryByTestId('ticket-plan-open')).toBeNull();
  });
});
