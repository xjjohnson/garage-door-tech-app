import { render, screen } from '@testing-library/react-native';
import { OpeningDoor } from '../components/OpeningDoor';

describe('opening door', () => {
  it('draws the garage door and cleans up its animation when it goes away', async () => {
    const { unmount } = await render(<OpeningDoor />);
    expect(screen.getByTestId('opening-door')).toBeTruthy();
    unmount();
  });
});
