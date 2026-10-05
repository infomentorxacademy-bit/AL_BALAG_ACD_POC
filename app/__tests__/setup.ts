// Native modules that do not exist under Node.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
// The real SafeAreaProvider renders nothing until the native side reports window metrics.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
