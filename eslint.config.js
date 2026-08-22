import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Deliberately close to the recommended sets. The rules worth having here are
 * the ones about hooks: the scanner and the auto loop are held together by
 * dependency arrays and refs, and every subtle bug this app has had lived in
 * one of them.
 */
export default [
  { ignores: ['dist/**', 'node_modules/**', '.venv-checker/**'] },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,

      // The app is not typed and does not use prop-types; the panels take a
      // dozen props each and declaring them twice would be the only effect.
      'react/prop-types': 'off',

      // An unused argument is usually a signature being honoured, an unused
      // variable is usually a mistake.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],

      // Off deliberately, and not because it is noisy. The four effects it
      // objects to are all the same shape: something outside React changes —
      // a roll fails for the third time, a panel opens, the reader has asked
      // for reduced motion — and a piece of interface state has to follow it.
      // That is what these effects are for, and the alternative the rule wants
      // is to lift each one into an event handler that does not exist. Reads
      // as an error today, so it would fail the build for existing, correct
      // code; the deps rule below is the one that has ever caught a bug here.
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  {
    files: ['scripts/**/*.mjs', 'tailwind.config.js'],
    languageOptions: { globals: globals.node },
  },

  // The one file still written as CommonJS.
  {
    files: ['postcss.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },

  {
    files: ['**/*.test.{js,jsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];
