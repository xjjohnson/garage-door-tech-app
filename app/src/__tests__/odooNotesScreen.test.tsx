import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { OdooNotes } from '../components/OdooNotes';
import { readOutbox } from '../lib/odooNotes';
import { AttachmentsProvider } from '../lib/useAttachments';
import { OdooProvider } from '../lib/useOdoo';

const settle = async () => {
  for (let i = 0; i < 8; i++) await act(async () => undefined);
};

describe('Notes section', () => {
  beforeEach(() => AsyncStorage.clear());

  it('queues a note with no signal and shows it as waiting, and can discard it', async () => {
    await render(
      <AttachmentsProvider media={null}>
        <OdooProvider>
          <OdooNotes target={{ model: 'fsm.order', id: 5 }} now={() => new Date(2026, 10, 14, 10).getTime()} />
        </OdooProvider>
      </AttachmentsProvider>,
    );
    await settle();
    expect(screen.getByText('No notes yet.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('notes-add'));
    await fireEvent.press(screen.getByTestId('notes-save'));
    expect(screen.getByText('Write something, or add a photo or voice note.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('notes-text'), 'Gate code 1234');
    await fireEvent.press(screen.getByTestId('notes-save'));
    await settle();
    expect(await readOutbox()).toMatchObject([{ body: 'Gate code 1234', target: { model: 'fsm.order', id: 5 } }]);
    expect(screen.getByText('Gate code 1234')).toBeTruthy();
    expect(screen.getByText(/waiting to send/)).toBeTruthy();
    const [n] = await readOutbox();
    await fireEvent.press(screen.getByTestId(`notes-discard-${n.id}`));
    await settle();
    expect(await readOutbox()).toEqual([]);
  });
});
