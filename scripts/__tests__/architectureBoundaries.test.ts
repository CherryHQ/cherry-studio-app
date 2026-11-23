import fs from 'node:fs';
import path from 'node:path';

import { ESLint } from 'eslint';

import eslintConfig from '../../eslint.config';
import todoConfig from '../../eslint.todo.config';

const root = path.resolve(__dirname, '../..');
// ESLint's config discovery uses dynamic import(), which Jest's CommonJS VM cannot execute.
// Load the real config through Jest and disable discovery without changing the rules under test.
const eslint = new ESLint({ cwd: root, overrideConfig: eslintConfig, overrideConfigFile: true });

async function boundaryErrors(filePath: string, source: string) {
  const [result] = await eslint.lintText(source, { filePath: path.join(root, filePath) });
  expect(result.fatalErrorCount).toBe(0);
  return result.messages.filter((message) =>
    [
      'import/no-restricted-paths',
      '@typescript-eslint/no-restricted-imports',
      'no-restricted-syntax',
    ].includes(message.ruleId ?? ''),
  );
}

describe('resolved architecture boundaries', () => {
  it.each([
    ['src/frontend/utils/probe.ts', "import '@/backend/data/services/ModelService';"],
    ['src/frontend/utils/probe.ts', "import '@src/backend/data/services/ModelService';"],
    ['src/frontend/utils/probe.ts', "import '../../backend/data/services/ModelService';"],
    ['src/frontend/utils/probe.ts', "export * from '../../backend/data/services/ModelService';"],
    ['src/frontend/utils/probe.ts', "void import('../../backend/data/services/ModelService');"],
    ['src/frontend/utils/probe.ts', "require('../../backend/data/services/ModelService');"],
    ['src/backend/data/probe.ts', "import '../services/models/createModelsModule';"],
    [
      'src/bootstrap/composition/probe.ts',
      "import '@/backend/ai/agent/diagnostics/createDiagnosticAgent';",
    ],
    ['src/backend/ai/agent/host/probe.ts', "import '../diagnostics/diagnosticAgentDefinition';"],
    [
      'src/bootstrap/composition/probe.ts',
      "import definition from '@/backend/ai/agent/diagnostics/diagnosticAgent.json';",
    ],
    ['src/frontend/features/chat/probe.ts', "import '../plugin';"],
    ['src/frontend/features/chat/probe.ts', "import type { PluginListScreen } from '../plugin';"],
    ['src/frontend/hooks/probe.ts', "import '../features/plugin';"],
    ['src/frontend/features/chat/probe.ts', "import '@/frontend/data/DataApiProvider';"],
    ['src/frontend/hooks/probe.ts', "import '../data/DataApiProvider';"],
    ['src/frontend/hooks/probe.ts', "void import('@src/frontend/data/DataApiProvider');"],
    [
      'src/frontend/features/settings/probe.ts',
      "import '@/frontend/components/ModelPicker/utils/modelPickerBadges';",
    ],
    [
      'src/frontend/components/Avatar/probe.ts',
      "import '../ModelPicker/components/ModelPickerBadge';",
    ],
    [
      'src/frontend/hooks/probe.ts',
      "require('@src/frontend/components/ModelPicker/hooks/useModelPickerData');",
    ],
    [
      'src/frontend/features/agents/probe.ts',
      "import '@/frontend/components/AgentEditor/hooks/useAgentAutoSave';",
    ],
    [
      'src/frontend/appShell/header/probe.ts',
      "import '@/frontend/components/AgentEditor/AgentEditor';",
    ],
    ['src/shared/utils/probe.ts', "import '../../frontend/data';"],
    ['src/shared/data/probe.ts', "import 'react-native';"],
    ['src/shared/utils/probe.ts', "import 'expo-file-system';"],
    ['src/frontend/utils/probe.ts', "import 'ai';"],
    ['src/frontend/utils/probe.ts', "import '@earendil-works/pi-ai';"],
    ['src/frontend/utils/probe.ts', "import 'drizzle-orm';"],
    ['src/frontend/utils/probe.ts', "import 'expo-sqlite';"],
    ['packages/universal/src/utils/probe.ts', "import '../../../../src/frontend/data';"],
  ])('rejects a forbidden dependency from %s: %s', async (filePath, source) => {
    expect(await boundaryErrors(filePath, source)).not.toHaveLength(0);
  });

  describe.each([
    ['src/frontend/utils/probe.ts', 'ai'],
    ['src/frontend/features/chat/probe.ts', '@ai-sdk/openai'],
    ['src/frontend/hooks/probe.ts', '@earendil-works/pi-ai/api/openai-completions'],
    ['src/frontend/utils/probe.ts', '@cherrystudio/ai-core/provider'],
    ['src/frontend/utils/probe.ts', '@cherrystudio/ai-sdk-provider'],
    ['src/frontend/utils/probe.ts', '@cherrystudio/ai-runtime/provider'],
    ['src/frontend/utils/probe.ts', '@cherrystudio/ai-runtime/utils'],
    ['src/frontend/utils/probe.ts', 'drizzle-orm/sqlite-core'],
    ['src/frontend/utils/probe.ts', 'expo-sqlite'],
    ['src/shared/data/probe.ts', 'react-native'],
    ['src/shared/utils/probe.ts', 'expo/fetch'],
    ['src/backend/services/models/probe.ts', '@earendil-works/pi-ai'],
    ['src/backend/ai/agent/runtime/probe.ts', 'react'],
    ['src/backend/ai/agent/runtime/pi/probe.ts', 'expo-file-system'],
    ['packages/universal/src/utils/probe.ts', '@expo/vector-icons'],
  ])('package boundary from %s to %s', (filePath, moduleId) => {
    it.each([
      `import '${moduleId}';`,
      `void import('${moduleId}');`,
      `require('${moduleId}');`,
      `void import(\`${moduleId}\`);`,
      `require(\`${moduleId}\`);`,
    ])('rejects %s', async (source) => {
      expect(await boundaryErrors(filePath, source)).not.toHaveLength(0);
    });
  });

  it.each([
    [
      'src/frontend/utils/probe.ts',
      "import { formatApiHost } from '@cherrystudio/universal/utils/url';",
    ],
    ['src/frontend/utils/probe.ts', "import '@cherrystudio/universal/ai/builtinTools';"],
    ['src/frontend/features/chat/probe.ts', "import './components/ChatInput/ChatInput';"],
    ['src/frontend/features/chat/probe.ts', "import '@/frontend/hooks/plugin';"],
    [
      'src/frontend/features/agents/probe.ts',
      "import { AgentEditor } from '@/frontend/components/AgentEditor';",
    ],
    ['src/frontend/components/AgentEditor/hooks/probe.ts', "import '../utils/agentForm';"],
    ['src/frontend/features/plugin/probe.ts', "import '@/frontend/components/PluginIcon';"],
    ['src/frontend/features/chat/probe.ts', "import { useApiClient } from '@/frontend/data';"],
    ['src/frontend/data/hooks/probe.ts', "import '../DataApiProvider';"],
    [
      'src/frontend/hooks/__tests__/probe.test.tsx',
      "import { DataApiProvider } from '@/frontend/data/DataApiProvider';",
    ],
    [
      'src/bootstrap/runtime/probe.ts',
      "import { DataApiProvider } from '@/frontend/data/DataApiProvider';",
    ],
    [
      'src/frontend/features/settings/probe.ts',
      "import { ModelPickerDrawer } from '@/frontend/components/ModelPicker';",
    ],
    [
      'src/frontend/features/settings/probe.ts',
      "import { ModelPickerBadge, getModelPickerBadges } from '@/frontend/components/ModelPicker/badges';",
    ],
    [
      'src/frontend/components/ModelPicker/components/probe.ts',
      "import '../utils/modelPickerBadges';",
    ],
    [
      'src/frontend/features/chat/probe.ts',
      "import '@/frontend/components/Composer/utils/composerAttachments';",
    ],
    ['src/frontend/utils/probe.ts', "import '@/shared/utils/providerEndpoints';"],
    ['src/frontend/utils/probe.ts', "void import('react-native');"],
    ['src/frontend/utils/probe.ts', "require('@/assets/icon.png');"],
    ['src/frontend/utils/probe.ts', 'void import(`@cherrystudio/universal/ai/builtinTools`);'],
    ['src/frontend/utils/probe.ts', 'require(`@cherrystudio/universal/ai/builtinTools`);'],
    ['src/backend/ai/generation/probe.ts', "void import('ai');"],
    ['src/bootstrap/composition/probe.ts', "import '@/backend/ai/agent/diagnostics';"],
    ['src/backend/ai/agent/diagnostics/probe.ts', "import './diagnosticAgentDefinition';"],
    [
      'src/backend/ai/agent/runtime/pi/probe.ts',
      "void import('@earendil-works/pi-ai/api/openai-completions');",
    ],
    [
      'src/backend/core/application/serviceRegistry.ts',
      "import '@/backend/ai/agent/runtime/pi/PiRuntimeService';",
    ],
    ['src/backend/core/application/serviceRegistry.ts', "void import('@earendil-works/pi-ai');"],
    [
      'src/backend/ai/agent/runtime/pi/piModelResolver.ts',
      "import '@/backend/data/services/ModelService';",
    ],
    ['src/backend/ai/agent/runtime/pi/piModelResolver.ts', "void import('expo/fetch');"],
  ])('preserves a permitted dependency from %s: %s', async (filePath, source) => {
    expect(await boundaryErrors(filePath, source)).toEqual([]);
  });

  describe('enterprise implementation boundary', () => {
    describe.each([
      ['src/backend/services/models/probe.ts', '@/backend/services/enterprise'],
      ['src/backend/services/models/probe.ts', '@src/backend/services/enterprise'],
      ['src/backend/services/models/probe.ts', '../enterprise'],
      ['src/backend/data/probe.ts', '../services/enterprise'],
      ['src/backend/core/probe.ts', '../services/enterprise'],
      ['src/backend/ai/generation/probe.ts', '../../services/enterprise'],
      ['src/backend/ai/agent/runtime/pi/probe.ts', '../../../../services/enterprise'],
      ['src/frontend/utils/probe.ts', '../../backend/services/enterprise'],
      ['src/shared/contracts/probe.ts', '../../backend/services/enterprise'],
    ])('keeps %s outside %s', (filePath, moduleId) => {
      it.each([
        `import '${moduleId}';`,
        `export { EnterpriseSyncService } from '${moduleId}';`,
        `void import('${moduleId}');`,
        `require('${moduleId}');`,
      ])('rejects %s', async (source) => {
        expect(await boundaryErrors(filePath, source)).not.toHaveLength(0);
      });
    });

    it.each([
      ['src/bootstrap/profile/installationAccount.ts', '@/backend/services/enterprise'],
      ['src/bootstrap/runtime/createAppBootstrapRuntime.ts', '@/backend/services/enterprise'],
      ['src/backend/core/application/serviceRegistry.ts', '@/backend/services/enterprise'],
      ['src/backend/services/enterprise/sync/probe.ts', '../enterpriseApi'],
    ])('allows enterprise assembly or internal use from %s', async (filePath, moduleId) => {
      expect(await boundaryErrors(filePath, `import '${moduleId}';`)).toEqual([]);
    });
  });

  describe('page raw timer and animation-frame guardrails', () => {
    async function schedulingErrors(filePath: string, source: string) {
      const [result] = await eslint.lintText(source, { filePath: path.join(root, filePath) });
      expect(result.fatalErrorCount).toBe(0);
      return result.messages.filter((message) =>
        ['no-restricted-globals', 'no-restricted-properties'].includes(message.ruleId ?? ''),
      );
    }

    it.each([
      ['src/frontend/features/chat/probe.ts', 'export const id = setTimeout(() => {}, 10);'],
      ['src/frontend/features/chat/probe.ts', 'export const id = setInterval(() => {}, 10);'],
      ['src/frontend/features/chat/probe.ts', 'export const id = requestAnimationFrame(() => {});'],
      ['src/app/probe.ts', 'export const id = setTimeout(() => {}, 10);'],
      [
        'src/frontend/features/chat/probe.ts',
        'export const id = globalThis.setTimeout(() => {}, 10);',
      ],
      [
        'src/frontend/features/chat/probe.ts',
        'export const id = window.requestAnimationFrame(() => {});',
      ],
      ['src/frontend/features/chat/probe.ts', 'export const sorted = [1, 2].toSorted();'],
    ])('rejects restricted timer/frame or toSorted usage in %s: %s', async (filePath, source) => {
      expect(await schedulingErrors(filePath, source)).not.toHaveLength(0);
    });

    it.each([
      ['src/frontend/hooks/probe.ts', 'export const id = setTimeout(() => {}, 10);'],
      ['src/frontend/utils/probe.ts', 'export const id = requestAnimationFrame(() => {});'],
      ['src/shared/utils/probe.ts', 'export const id = setTimeout(() => {}, 0);'],
      [
        'src/frontend/features/chat/__tests__/probe.test.ts',
        'export const id = setTimeout(() => {}, 10);',
      ],
    ])(
      'allows raw scheduling primitives in shared owners and tests (%s)',
      async (filePath, source) => {
        expect(await schedulingErrors(filePath, source)).toEqual([]);
      },
    );
  });

  describe('page useEffect guardrail', () => {
    async function pageEffectErrors(filePath: string, source: string) {
      const [result] = await eslint.lintText(source, { filePath: path.join(root, filePath) });
      expect(result.fatalErrorCount).toBe(0);
      return result.messages.filter((message) =>
        [
          'cherry-page/use-effect-limit',
          'no-restricted-imports',
          'no-restricted-properties',
        ].includes(message.ruleId ?? ''),
      );
    }

    it.each([
      [
        'src/frontend/features/chat/probe.ts',
        "import { useEffect } from 'react'; export const ref = useEffect;",
      ],
      ['src/app/probe.ts', "import { useEffect } from 'react'; export const ref = useEffect;"],
      [
        'src/frontend/features/chat/probe.ts',
        "import React from 'react'; export const ref = React.useEffect;",
      ],
      // Verify flat-config rule composition keeps retiredImports, tombstones, toSorted, and timers active.
      ['src/frontend/features/chat/probe.ts', "import 'heroui-native/toast';"],
      ['src/frontend/features/chat/probe.ts', "import '@/features/chat';"],
    ])(
      'rejects new page useEffect and preserves existing restrictions in %s',
      async (filePath, source) => {
        expect(await pageEffectErrors(filePath, source)).not.toHaveLength(0);
      },
    );

    it.each([
      [
        'src/frontend/hooks/probe.ts',
        "import { useEffect } from 'react'; export const ref = useEffect;",
      ],
      [
        'src/frontend/appShell/probe.ts',
        "import { useEffect } from 'react'; export const ref = useEffect;",
      ],
      [
        'src/frontend/components/probe.ts',
        "import { useEffect } from 'react'; export const ref = useEffect;",
      ],
      [
        'src/frontend/features/chat/__tests__/probe.test.tsx',
        "import { useEffect } from 'react'; export const ref = useEffect;",
      ],
    ])('allows useEffect in shared frontend owners and tests (%s)', async (filePath, source) => {
      expect(await pageEffectErrors(filePath, source)).toEqual([]);
    });

    it('rejects an extra effect in a page with an existing allowance', async () => {
      const filePath = 'src/frontend/features/chat/components/ChatInput/ChatInput.tsx';
      const source = fs.readFileSync(path.join(root, filePath), 'utf8');
      const extraEffect =
        "\nimport { useEffect as syncEffect } from 'react';\nsyncEffect(() => {});";
      const messages = await pageEffectErrors(filePath, source + extraEffect);
      expect(
        messages.filter((message) => message.ruleId === 'cherry-page/use-effect-limit'),
      ).toHaveLength(1);
    });

    it('keeps every legacy limit on an existing page', () => {
      const guardrail = eslintConfig.find((entry) => entry.name === 'page-use-effect-guardrail');
      const rule = guardrail?.rules?.['cherry-page/use-effect-limit'];
      const limits = Array.isArray(rule) ? rule[1] : undefined;
      expect(limits).toBeDefined();
      expect(
        Object.keys(limits ?? {}).filter((file) => !fs.existsSync(path.join(root, file))),
      ).toEqual([]);
    });
  });

  describe('tracked TODO/FIXME guardrail', () => {
    const toolingLint = new ESLint({
      cwd: root,
      overrideConfig: todoConfig,
      overrideConfigFile: true,
    });

    async function todoErrors(filePath: string, source: string) {
      const linter = filePath.startsWith('src/') ? eslint : toolingLint;
      const [result] = await linter.lintText(source, { filePath: path.join(root, filePath) });
      expect(result.fatalErrorCount).toBe(0);
      return result.messages.filter(
        (message) => message.ruleId === 'cherry/require-todo-issue-ref',
      );
    }

    it.each([
      ['src/frontend/utils/probe.ts', '// TODO: clean this up later\nexport const x = 1;'],
      ['packages/ai-runtime/src/probe.ts', '// FIXME: workaround for timing\nexport const x = 1;'],
      ['scripts/probe.ts', '/* TODO(ios-only): later */\nexport const x = 1;'],
    ])('rejects untracked TODO/FIXME comments in %s', async (filePath, source) => {
      expect(await todoErrors(filePath, source)).not.toHaveLength(0);
    });

    it.each([
      [
        'src/frontend/utils/probe.ts',
        '// TODO(#1234): remove after migration\nexport const x = 1;',
      ],
      ['src/frontend/utils/probe.ts', '/* FIXME(#42): upstream bug */\nexport const x = 1;'],
      ['src/frontend/utils/probe.ts', "export const text = 'TODO inside string literal';"],
    ])(
      'allows tracked issue references and non-comment literals in %s',
      async (filePath, source) => {
        expect(await todoErrors(filePath, source)).toEqual([]);
      },
    );
  });

  describe('direct expo-haptics guardrail', () => {
    async function hapticsImportErrors(filePath: string, source: string) {
      const [result] = await eslint.lintText(source, { filePath: path.join(root, filePath) });
      expect(result.fatalErrorCount).toBe(0);
      return result.messages.filter((message) => message.ruleId === 'no-restricted-imports');
    }

    it.each([
      [
        'src/frontend/appShell/navigationShell/probe.ts',
        "import * as Haptics from 'expo-haptics';",
      ],
      ['src/frontend/features/more/probe.ts', "import * as Haptics from 'expo-haptics';"],
    ])('rejects direct expo-haptics import in %s', async (filePath, source) => {
      expect(await hapticsImportErrors(filePath, source)).not.toHaveLength(0);
    });

    it.each([
      [
        'src/frontend/appShell/navigationShell/probe.ts',
        "import { haptics } from '@cherrystudio/ui/haptics';",
      ],
      [
        'src/frontend/features/more/probe.ts',
        "import { triggerHaptic } from '@cherrystudio/ui/haptics';",
      ],
    ])('allows shared @cherrystudio/ui/haptics import in %s', async (filePath, source) => {
      expect(await hapticsImportErrors(filePath, source)).toEqual([]);
    });

    it('keeps every legacy direct expo-haptics exemption on an existing file', () => {
      const guardrail = eslintConfig.find(
        (entry) => entry.name === 'legacy-direct-haptics-allowlist',
      );
      const files = guardrail?.files ?? [];
      expect(files.length).toBeGreaterThan(0);
      expect(files.filter((file) => !fs.existsSync(path.join(root, String(file))))).toEqual([]);
    });
  });
});
