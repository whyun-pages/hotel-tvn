// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from "globals";

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier, // 放在最后，关闭与 Prettier 冲突的规则
  {
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
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
      "curly": "error", // 强制使用大括号
      // 2. 强制大括号换行风格
      "brace-style": ["error", "1tbs", { "allowSingleLine": false }],
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