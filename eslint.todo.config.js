const { createRequire } = require('node:module');
const { defineConfig } = require('eslint/config');

// Keep the same TypeScript parser as the app without applying app-specific lint rules to packages.
const expoRequire = createRequire(require.resolve('eslint-config-expo/package.json'));
const parser = expoRequire('@typescript-eslint/parser');

/** @type {import('eslint').ESLint.Plugin} */
const cherryLocalPlugin = {
  rules: {
    // Prevent untracked TODO/FIXME comments from turning into stale excuses for workarounds.
    'require-todo-issue-ref': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          missingIssue:
            '{{tag}} comments must reference a tracked GitHub issue, e.g. `{{tag}}(#123): ...`. Remove stale reminders or fix the root cause.',
        },
      },
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              const match = comment.value.match(/\b(TODO|FIXME)\b(?!\(#\d+\))/);
              if (match) {
                context.report({
                  loc: comment.loc,
                  messageId: 'missingIssue',
                  data: { tag: match[1] },
                });
              }
            }
          },
        };
      },
    },
  },
};

module.exports = defineConfig([
  {
    files: ['**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}'],
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { cherry: cherryLocalPlugin },
    rules: { 'cherry/require-todo-issue-ref': 'error' },
  },
]);
