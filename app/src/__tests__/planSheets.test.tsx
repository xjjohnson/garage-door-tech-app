import { fireEvent, render, screen } from '@testing-library/react-native';
import { AgreementSheet, NewFollowUpSheet, RepeatSheet } from '../components/PlanSheets';

describe('repeat and follow-up sheets', () => {
  it('picks a customer, then saves a follow-up', async () => {
    const onSave = jest.fn();
    await render(<NewFollowUpSheet visible customers={[{ id: 7, name: 'Pat Smith' }, { id: 8, name: 'Lee Wong' }]} onSave={onSave} onCancel={() => undefined} />);
    expect(screen.getByTestId("followup-sheet-save")).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('followup-customer-search'), 'pat');
    await fireEvent.press(screen.getByTestId('followup-pick-7'));
    await fireEvent.changeText(screen.getByTestId('followup-title'), 'Call about opener');
    await fireEvent.press(screen.getByTestId('followup-sheet-save'));
    expect(onSave).toHaveBeenCalledWith({ customerId: 7, title: 'Call about opener', note: '', days: 7 });
  });

  it('starts on the yearly tune-up, a year out', async () => {
    const onSave = jest.fn();
    await render(<RepeatSheet visible customer="Pat" sets={[{ id: 4, name: 'Every 6 months' }]} onSave={onSave} onCancel={() => undefined} />);
    await fireEvent.press(screen.getByTestId('repeat-sheet-save'));
    expect(onSave).toHaveBeenCalledWith({ every: 'yearly', days: 365, what: 'Annual tune-up' });
  });
});

describe('agreement sheet', () => {
  it('saves a one year plan under a repeat, and edits only name and notes', async () => {
    const onSave = jest.fn();
    const repeats = [{ id: 3, name: 'FSM/REC/1', status: 'Active', active: true, every: 'Yearly' }];
    await render(<AgreementSheet visible customer="Pat" repeats={repeats} onSave={onSave} onCancel={() => undefined} />);
    await fireEvent.press(screen.getByText('Yearly (FSM/REC/1)'));
    await fireEvent.press(screen.getByTestId('agreement-sheet-save'));
    expect(onSave).toHaveBeenCalledWith({ name: 'Yearly service plan', notes: '', years: 1, repeatId: 3 });
  });
});
