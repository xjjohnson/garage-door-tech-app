import { fireEvent, render, screen } from '@testing-library/react-native';
import { EMPTY_BUSINESS, parseBusiness, reviewRequestText } from '../lib/invoices';
import { fillText, messageText, wording } from '../lib/messageTexts';
import { onMyWayText } from '../lib/schedule';
import { TextsTab } from '../screens/TextsTab';
import * as settingsSync from '../lib/settingsSync';

let mockBiz = { ...EMPTY_BUSINESS, name: 'Johnsons', reviewUrl: 'g.page/r/abc' };
const mockSetBusiness = jest.fn((fn: (b: typeof mockBiz) => typeof mockBiz) => {
  mockBiz = fn(mockBiz);
});
jest.mock('../lib/useInvoices', () => ({ useInvoices: () => ({ business: mockBiz, setBusiness: mockSetBusiness }) }));

describe('pre-written texts', () => {
  it('uses the standard wording when blank and fills in the words', () => {
    expect(onMyWayText({ name: 'Maria Lopez' }, 'Johnsons', 20)).toBe("Hi Maria, it's Johnsons. I'm on my way and should be there in about 20 minutes.");
    expect(onMyWayText({ name: '' }, { ...EMPTY_BUSINESS }, 15, 'eta')).toContain('Hi there, it\'s your garage door tech. Quick update');
    expect(reviewRequestText({ billTo: 'Sam Lee' }, mockBiz)).toBe("Hi Sam, thanks for choosing Johnsons! If you're happy with the work on your garage door, a quick review helps a lot: https://g.page/r/abc");
  });

  it('uses the owner\'s own wording and leaves unknown words alone', () => {
    const b = { ...mockBiz, textOnMyWay: 'Hey {first}, {business} here, ~{minutes} min out {oops}' };
    expect(wording(b, 'onMyWay')).toBe(b.textOnMyWay);
    expect(messageText(b, 'onMyWay', { name: 'Maria L', minutes: 10 })).toBe('Hey Maria, Johnsons here, ~10 min out {oops}');
    expect(fillText('  {first}  ', {})).toBe('there');
  });

  it('keeps the wording through parseBusiness', () => {
    expect(parseBusiness({ textEta: 'x' }).textEta).toBe('x');
    expect(parseBusiness({}).textReview).toBe('');
  });

  it('lets the owner edit and save the wording, and locks it for others', async () => {
    const queue = jest.spyOn(settingsSync, 'queueBusiness').mockImplementation(() => undefined);
    const { rerender } = await render(<TextsTab canEdit />);
    await fireEvent.changeText(screen.getByTestId('manage-text-eta'), 'Be there in {minutes}');
    expect(mockBiz.textEta).toBe('Be there in {minutes}');
    await rerender(<TextsTab canEdit />);
    expect(screen.getByTestId('manage-text-preview-eta').props.children.join('')).toContain('Be there in 20');
    await fireEvent.press(screen.getByTestId('manage-texts-save'));
    expect(queue).toHaveBeenCalledWith(expect.objectContaining({ textEta: 'Be there in {minutes}' }));
    await rerender(<TextsTab canEdit={false} />);
    expect(screen.queryByTestId('manage-texts-save')).toBeNull();
  });
});
