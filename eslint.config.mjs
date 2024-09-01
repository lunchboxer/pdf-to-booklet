import js from '@eslint/js'
import globals from 'globals'
import eslintPluginUnicorn from 'eslint-plugin-unicorn'
import standardConfig from './eslint-standard.config.js'

export default [
  eslintPluginUnicorn.configs['flat/recommended'],
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...standardConfig.rules,
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
      'unicorn/template-indent': [
        'error',
        {
          indent: 2,
        },
      ],
    },
  },
]
