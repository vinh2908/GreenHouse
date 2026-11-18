// ESLint flat config — R12 mục 15.
//
// job-detail ~4.700 dòng nhưng mobile chưa từng có kiểm tra Rules of Hooks.
// Chỉ bật eslint-plugin-react-hooks (config only, KHÔNG refactor file lớn):
//   - react-hooks/rules-of-hooks: error (hook gọi sai vị trí = bug thật)
//   - react-hooks/exhaustive-deps: warn (thiếu dep thường là mùi, không chặn)
// Chạy: pnpm --filter @homemate/mobile lint  (tsc --noEmit && eslint <thư mục src>)
// Ghi chú: admin đã có react-hooks qua next/core-web-vitals; API không dùng React.
import reactHooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: ['node_modules/**', '.expo/**', 'android/**', 'ios/**', 'dist/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      // Chỉ để các `eslint-disable-next-line @typescript-eslint/...` có sẵn
      // trong code (vd. require() lazy native modules) phân giải được —
      // không bật thêm rule nào của plugin này ở đây.
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Các `eslint-disable-next-line @typescript-eslint/no-require-imports`
    // có sẵn trong code là ghi chú "require() này cố ý" (asset RN, lazy
    // import tránh circular) — rule không bật ở đây nên không báo chúng
    // là directive thừa.
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
];
