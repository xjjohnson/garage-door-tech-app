import { useEffect, useState } from 'react';
import { onThemeChange, themeVersion } from '../theme';

/** Redraws the component whenever the theme changes (a role switch). For screens that read colors or layouts directly. */
export function useThemeVersion(): number {
  const [, tick] = useState(0);
  useEffect(() => onThemeChange(() => tick((n) => n + 1)), []);
  return themeVersion();
}
