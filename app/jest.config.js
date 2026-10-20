// UI tests (React Native components rendered with a test renderer). The pure-logic tests in tests/ run on
// plain Node (`npm test`); these need the React Native preset (`npm run test:ui`).
module.exports = {
  preset: 'jest-expo',
  // The first test in a file also pays for compiling the screens; CI runners are slower than a laptop.
  testTimeout: 30000,
  testMatch: ['<rootDir>/__tests__/**/*.test.tsx'],
  setupFiles: ['<rootDir>/__tests__/setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))',
  ],
};
