import { renderRouter } from 'expo-router/testing-library';

/**
 * Renders the whole app from its real route files (src/app), starting at a
 * section's address. renderRouter runs Jest on fake timers, so tests read
 * saved data (AsyncStorage) straight after an action rather than through an
 * async waitFor, which never settles under fake timers.
 */
export function renderApp(initialUrl = '/') {
  return renderRouter('src/app', { initialUrl });
}
