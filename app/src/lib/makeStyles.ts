import { ImageStyle, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { onThemeChange, themeVersion } from '../theme';
import { useEffect, useState } from 'react';

/**
 * Builds a screen's styles from the theme in use, and rebuilds them when the theme changes
 * (a role switch). Use it where `StyleSheet.create({...})` used to be at the top of a file:
 *
 *   const useStyles = makeStyles(() => ({ box: { padding: sp(12) } }));
 *   // inside each component that uses them:
 *   const styles = useStyles();
 *
 * The result is cached per theme version, so drawing costs nothing extra.
 */
type Styles = { [key: string]: ViewStyle | TextStyle | ImageStyle };

export function makeStyles<T extends Styles>(factory: () => T): () => T {
  let built: T | undefined;
  let builtFor = -1;
  const get = (): T => {
    const v = themeVersion();
    if (built === undefined || builtFor !== v) {
      built = StyleSheet.create(factory());
      builtFor = v;
    }
    return built;
  };
  return function useStyles() {
    const [, tick] = useState(0);
    useEffect(() => onThemeChange(() => tick((n) => n + 1)), []);
    return get();
  };
}
