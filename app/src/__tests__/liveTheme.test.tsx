import { act, render, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { makeStyles } from '../lib/makeStyles';
import { themeById } from '../lib/themes';
import { applyTheme, colors, layouts, look, onThemeChange, radius, rad, sp, themeDef, themeVersion, touch } from '../theme';

const start = themeDef.id;
afterEach(() => act(async () => applyTheme(start)));

describe('live theme', () => {
  it('changes the theme objects in place, so what a screen reads is current', async () => {
    const sameColors = colors;
    const sameLayouts = layouts;
    const before = colors.bg;
    await act(async () => applyTheme('owner'));
    expect(colors).toBe(sameColors);
    expect(layouts).toBe(sameLayouts);
    expect(themeDef.id).toBe('owner');
    expect(layouts.home).toBe(themeById('owner').layouts.home);
    expect(look.shape).toBe(themeById('owner').shape);
    expect(colors.bg).not.toBe(before);
    expect(touch.min).toBeGreaterThan(0);
    await act(async () => applyTheme('classic'));
    expect(layouts.home).toBe('classic');
  });

  it('never changes the shared theme list when it changes the theme in use', async () => {
    const field = themeById('field');
    const homeBefore = field.layouts.home;
    await act(async () => applyTheme('field'));
    layouts.home = 'classic';
    expect(themeById('field').layouts.home).toBe(homeBefore);
  });

  it('counts each change and tells listeners', async () => {
    const seen = jest.fn();
    const off = onThemeChange(seen);
    const v = themeVersion();
    await act(async () => applyTheme('dispatch'));
    expect(themeVersion()).toBe(v + 1);
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    await act(async () => applyTheme('sales'));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('keeps the size helpers and shared sizes in step', async () => {
    await act(async () => applyTheme('classic'));
    const classicCard = radius.card;
    await act(async () => applyTheme('dispatch'));
    expect(radius.card).toBe(rad(16));
    expect(sp(12)).toBe(sp(12));
    expect(typeof classicCard).toBe('number');
  });

  it('makeStyles rebuilds a screen\'s styles when the theme changes, and a mounted screen redraws', async () => {
    const useStyles = makeStyles(() => ({ box: { backgroundColor: colors.bg, padding: sp(12) } }));
    const Box = () => {
      const styles = useStyles();
      return (
        <View testID="box" style={styles.box}>
          <Text>hi</Text>
        </View>
      );
    };
    await act(async () => applyTheme('classic'));
    await render(<Box />);
    const first = JSON.stringify(screen.getByTestId('box').props.style);
    await act(async () => applyTheme('owner'));
    expect(JSON.stringify(screen.getByTestId('box').props.style)).not.toBe(first);
    expect(screen.getByTestId('box').props.style.backgroundColor).toBe(colors.bg);
  });

  it('builds styles once per theme, not on every draw', async () => {
    const factory = jest.fn(() => ({ a: { margin: 1 } }));
    const useStyles = makeStyles(factory);
    const A = () => {
      useStyles();
      return null;
    };
    await render(<A />);
    await render(<A />);
    expect(factory).toHaveBeenCalledTimes(1);
    await act(async () => applyTheme('office'));
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
