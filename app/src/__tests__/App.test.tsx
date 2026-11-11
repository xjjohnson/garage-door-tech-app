import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import App from '../../App';
import { SAFETY_TEXT } from '../components/results';
import { MATCH_STORAGE_KEY } from '../screens/MatchScreen';

/** Open a field's keypad, press the keys, tap Done. */
async function enter(fieldTestId: string, keys: string[]) {
  await fireEvent.press(screen.getByTestId(fieldTestId));
  const pad = screen.getByTestId('keypad');
  for (const k of keys) {
    // Odd sixteenths live behind the 16ths toggle.
    if (/^\d+\/16$/.test(k)) await fireEvent.press(within(pad).getByTestId('key-toggle-16ths'));
    await fireEvent.press(within(pad).getByTestId(`key-${k}`));
  }
  await fireEvent.press(within(pad).getByTestId('keypad-done'));
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('spring calculator app', () => {
  it('shows the safety banner on both tabs, with no way to close it', async () => {
    await render(<App />);
    expect(screen.getByText(SAFETY_TEXT)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('tab-door'));
    expect(screen.getByText(SAFETY_TEXT)).toBeTruthy();
    expect(screen.queryByText(/dismiss|close/i)).toBeNull();
  });

  it('match mode: 20 coils 4 1/2, 24" pair on a 7\' door gives a .225 x 2" x 24"', async () => {
    await render(<App />);
    expect(screen.getByTestId('missing')).toBeTruthy();
    await enter('field-twenty', ['4', '1/2']);
    await enter('field-length', ['2', '4']);
    const results = await screen.findByTestId('match-results');
    expect(within(results).getByText('.225 × 2" × 24"')).toBeTruthy();
    expect(within(screen.getByTestId('card-old')).getByText('7 1/2')).toBeTruthy();
    expect(screen.getByTestId('card-equal')).toBeTruthy();
    expect(screen.getByTestId('card-upgrade')).toBeTruthy();
    // Wind not chosen yet: a CHECK warning, but no stop.
    expect(screen.getAllByTestId('warning-caution').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('stop-note')).toBeNull();
  });

  it('match mode: an ambiguous 20-coil reading hides the order options', async () => {
    await render(<App />);
    await enter('field-twenty', ['4', '7/16']);
    await enter('field-length', ['2', '4']);
    await screen.findByTestId('match-results');
    expect(screen.getByTestId('warning-stop')).toBeTruthy();
    expect(screen.getByTestId('stop-note')).toBeTruthy();
    expect(screen.queryByTestId('card-equal')).toBeNull();
    expect(screen.queryByTestId('card-upgrade')).toBeNull();
  });

  it('match mode: cancel on the keypad keeps the old value', async () => {
    await render(<App />);
    await enter('field-length', ['2', '4']);
    await fireEvent.press(screen.getByTestId('field-length'));
    await fireEvent.press(within(screen.getByTestId('keypad')).getByTestId('key-clear'));
    await fireEvent.press(screen.getByTestId('keypad-cancel'));
    expect(screen.getByLabelText('Spring length (relaxed): 24 in')).toBeTruthy();
  });

  it('size from door: a 164 lb 7\' door with a pair lists options and turns', async () => {
    await render(<App />);
    await fireEvent.press(screen.getByTestId('tab-door'));
    await enter('field-weight', ['1', '6', '4']);
    const results = await screen.findByTestId('door-results');
    expect(within(screen.getByTestId('card-turns')).getByText('7 1/2')).toBeTruthy();
    expect(within(results).getAllByTestId('door-option').length).toBeGreaterThan(0);
  });

  it('both screens offer 12" and 15" track, 15" picked to start', async () => {
    await render(<App />);
    const match = screen.getByTestId('track');
    expect(within(match).getByRole('radio', { name: '15"' }).props.accessibilityState).toEqual({ selected: true });
    await enter('field-twenty', ['4', '1/2']);
    await enter('field-length', ['2', '4']);
    const before = within(screen.getByTestId('card-old')).getByText(/\d–[\d,]+ lb$/).props.children;
    await fireEvent.press(within(match).getByRole('radio', { name: '12"' }));
    const after = within(screen.getByTestId('card-old')).getByText(/\d–[\d,]+ lb$/).props.children;
    expect(after).not.toEqual(before);
    await fireEvent.press(screen.getByTestId('tab-door'));
    expect(within(screen.getByTestId('door-track')).getByRole('radio', { name: '12"' })).toBeTruthy();
  });

  it('size from door: a weight out of range shows a stop, not a crash', async () => {
    await render(<App />);
    await fireEvent.press(screen.getByTestId('tab-door'));
    await enter('field-weight', ['5']);
    // One STOP card in the results, and the pinned bar says STOP too.
    expect(await screen.findAllByTestId('warning-stop')).toHaveLength(1);
    expect(within(screen.getByTestId('door-bar')).getByText(/Door weight must be between/)).toBeTruthy();
  });

  it('the pinned bar says what is missing, then the answer', async () => {
    await render(<App />);
    expect(within(screen.getByTestId('match-bar')).getByText('Enter length of 20 coils')).toBeTruthy();
    await enter('field-twenty', ['4', '1/2']);
    await enter('field-length', ['2', '4']);
    expect(within(screen.getByTestId('match-bar')).getByText('.225 × 2" × 24"')).toBeTruthy();
    expect(within(screen.getByTestId('match-bar')).getByText(/Wind 7 1\/2 turns/)).toBeTruthy();
  });

  it('clear all inputs needs a second tap', async () => {
    await render(<App />);
    await enter('field-length', ['2', '4']);
    await fireEvent.press(screen.getByTestId('clear-match'));
    expect(screen.getByLabelText('Spring length (relaxed): 24 in')).toBeTruthy();
    expect(within(screen.getByTestId('clear-match')).getByText('Tap again to clear all')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('clear-match'));
    expect(screen.getByLabelText('Spring length (relaxed): not entered')).toBeTruthy();
  });

  it('remembers the last inputs per tab', async () => {
    const first = await render(<App />);
    await enter('field-length', ['2', '6']);
    await waitFor(async () => expect(await AsyncStorage.getItem(MATCH_STORAGE_KEY)).toContain('"length":"26"'));
    await first.unmount();
    await render(<App />);
    expect(await screen.findByLabelText('Spring length (relaxed): 26 in')).toBeTruthy();
  });
});
