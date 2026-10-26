// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'scripts/*', 'plugins/*', 'lint-report.json'],
  },
  {
    settings: {
      'import/resolver': {
        'babel-module': {},
        node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
      },
    },
    rules: {
      // React Compiler rules: the app does not use the React Compiler, and the converted screens keep the web
      // app's component code (written without the compiler) on purpose.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/error-boundaries': 'off',
      // quotes/apostrophes in <Text> are plain characters in React Native
      'react/no-unescaped-entities': 'off',
      // memo/forwardRef components keep the web's names; DevTools naming only
      'react/display-name': 'off',
      // Expo SDK modules re-export with `export *` from TypeScript builds; the namespace check cannot see those names
      'import/namespace': 'off',
    },
  },
]);
