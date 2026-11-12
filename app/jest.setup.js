// The real AsyncStorage needs a phone; tests use the in-memory mock it ships.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// SafeAreaProvider waits for real screen insets before drawing; the library's
// mock gives it fixed ones so the tree renders in tests.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// There's no camera or PDF maker in tests. Tests that need them fake them
// (see attachments.test.tsx); everything else sees "not on this phone".
jest.mock('./src/lib/deviceMedia', () => ({ deviceMedia: () => null }));

// No keystore in tests either: nothing is saved, so every test starts signed out of Odoo.
jest.mock('./src/lib/secrets', () => {
  const none = { get: async () => null, set: async () => undefined, remove: async () => undefined };
  return { NO_SECRETS: none, deviceSecrets: () => none };
});

// There's no WebView in tests: a plain view that keeps its props, so tests
// can read the page it was given, send it messages, and see what the app ran in it.
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const injected = [];
  const WebView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: (js) => injected.push(js), reload: () => undefined }));
    return React.createElement(View, { testID: props.testID ?? 'webview', webProps: props });
  });
  WebView.injected = injected;
  return { __esModule: true, default: WebView, WebView };
});
