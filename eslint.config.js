import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            'vendor/**',
            'storage/**',
            'bootstrap/cache/**',
            'public/**',
            'node_modules/**',
            '*.config.js',
            '*.config.ts',
        ],
    },

    js.configs.recommended,
    ...tseslint.configs.recommended,

    react.configs.flat.recommended,
    react.configs.flat['jsx-runtime'],

    {
        files: ['resources/**/*.{ts,tsx}'],
        plugins: {
            'react-hooks': reactHooks,
        },
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                route: 'readonly',
            },
        },
        settings: {
            react: {
                version: '19.2',
            },
        },
        rules: {
            ...reactHooks.configs.recommended.rules,

            'react/prop-types': 'off',
            'react/no-unescaped-entities': 'off',

            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',

            'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
        },
    },

    prettierConfig
);
