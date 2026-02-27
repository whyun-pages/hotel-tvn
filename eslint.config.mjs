// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';


export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier, // 放在最后，关闭与 Prettier 冲突的规则
  {
    rules: {
      // 你的其他规则
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        args: 'after-used',
        // TypeScript 特有的选项
        ignoreRestSiblings: true, // 忽略解构剩余变量（如 const { a, ...rest } = obj）
      }],
    },
  },
  {
    ignores: [
      'dist/',
      'eslint.config.mjs',
      'node_modules/',
    ],
  },

);