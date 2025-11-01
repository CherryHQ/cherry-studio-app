import expo from 'eslint-config-expo/flat.js'
import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import unusedImports from 'eslint-plugin-unused-imports'
import simpleImportSort from 'eslint-plugin-simple-import-sort'

const ignores = [
  'node_modules/**',
  '.yarn/**',
  'packages/*/node_modules/**',
  'dist/**',
  'build/**',
  '.expo/**',
  'web-build/**',
  'ios/**',
  'android/**',
  'expo-env.d.ts',
  '**/*.tsbuildinfo',
  '.cache/**',
  '.next/**',
  '.turbo/**',
  '.parcel-cache/**',
  '.DS_Store',
  '.DS_Store?/**',
  '._*',
  '.Spotlight-V100',
  '.Trashes',
  'ehthumbs.db',
  'Thumbs.db',
  '.vscode/**',
  '.idea/**',
  '**/*.swp',
  '**/*.swo',
  '*~',
  '**/*.tmp',
  '**/*.temp',
  '.tmp/**',
  'logs/**',
  '**/*.log',
  'npm-debug.log*',
  'yarn-debug.log*',
  'yarn-error.log*',
  'coverage/**',
  '**/*.lcov',
  '**/*.db',
  '**/*.sqlite',
  '**/*.sqlite3',
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.svg',
  '**/*.ico',
  '**/*.pdf',
  '**/*.zip',
  '**/*.tar',
  '**/*.gz',
  '**/*.tgz',
  '.metro/**',
  'metro.config.js',
  'ios/Pods/**',
  'android/app/build/**'
]

export default defineConfig([
  ...expo,
  eslint.configs.recommended,
  // Common rules for all JS/JSX/TS/TSX files
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports
    },
    rules: {
      'no-unused-vars': 'off',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_'
        }
      ]
    }
  },
  // TypeScript-specific rules
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-empty-object-type': 'off'
    }
  },
  // Node.js scripts
  {
    files: ['scripts/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        RequestInit: 'readonly'
      }
    }
  },
  { ignores }
])
