import { render, screen } from '@testing-library/react-native';
import { OpeningDoor, stagePercent } from '../components/OpeningDoor';

describe('opening door', () => {
  it('turns loading stages into 0, 25, 50, 75 and 100 percent', () => {
    expect([0, 1, 2, 3, 4].map(stagePercent)).toEqual([0, 25, 50, 75, 100]);
    expect(stagePercent(9)).toBe(100);
  });

  it('draws four bars and tells screen readers how far along it is, then cleans up', async () => {
    const { rerender, unmount } = await render(<OpeningDoor stage={1} />);
    expect(screen.getByTestId('opening-door').props.accessibilityLabel).toBe('Opening, 25 percent');
    for (let i = 0; i < 4; i++) expect(screen.getByTestId(`opening-door-bar-${i}`)).toBeTruthy();
    await rerender(<OpeningDoor stage={4} />);
    expect(screen.getByTestId('opening-door').props.accessibilityLabel).toBe('Opening, 100 percent');
    unmount();
  });
});
