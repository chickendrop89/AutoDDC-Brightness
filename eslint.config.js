import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                global: 'readonly',
                log: 'readonly',
                logError: 'readonly',
                print: 'readonly',
                printerr: 'readonly',
                imports: 'readonly',
                ARGV: 'readonly',
                Extension: 'readonly',
                Gettext: 'readonly',
                _: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['warn', { 
                'argsIgnorePattern': '^_',
                'varsIgnorePattern': '^_',
            }],
            'no-console': 'off',
            'no-redeclare': 'error',
            'no-shadow': 'warn',
            'prefer-const': 'error',
            'semi': ['error', 'always'],
            'quotes': ['error', 'single', { 'avoidEscape': true }],
            'indent': ['error', 4, { 'SwitchCase': 1 }],
            'comma-dangle': ['error', 'always-multiline'],
        },
    },
];
