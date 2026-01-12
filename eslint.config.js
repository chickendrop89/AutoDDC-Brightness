/*
 * Sync external monitor brightness with daylight cycles via DDC/CI.
 * Copyright (C) 2026 chickendrop89
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
*/

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
