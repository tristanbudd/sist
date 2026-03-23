import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
    {
        ignores: [
            'vendor/**',
            'storage/**',
            'bootstrap/cache/**',
            'public/**',
            'node_modules/**',
            '*.config.js'
        ],
    },
    
    js.configs.recommended,
    
    react.configs.flat.recommended,
    react.configs.flat['jsx-runtime'],
    
    {
        files: ['resources/**/*.{js,jsx,ts,tsx}'],
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
                version: '18.2',
            },
        },
        rules: {
            ...reactHooks.configs.recommended.rules,

            'react/prop-types': 'off',
            'react/no-unescaped-entities': 'off',
            'no-unused-vars': 'warn',
            'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
        },
    },
    
    prettierConfig,
];