// The real AsyncStorage needs a phone; tests use the in-memory mock it ships.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// SafeAreaProvider waits for real screen insets before drawing; the library's
// mock gives it fixed ones so the tree renders in tests.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
