import eslint from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const typescriptFiles = ['**/*.{ts,tsx}']
const typeCheckedConfigs = tseslint.configs.recommendedTypeChecked.map(
  (config) => ({ ...config, files: typescriptFiles }),
)

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      '.worktrees/**',
      '**/.silen/dist',
      '**/.silen/.temp/**',
      '**/.silen/.*.silen-stage-*/**',
      '**/.silen/.*.silen-backup-*/**',
      'docs/.silen',
    ],
  },
  eslint.configs.recommended,
  ...typeCheckedConfigs,
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
)
