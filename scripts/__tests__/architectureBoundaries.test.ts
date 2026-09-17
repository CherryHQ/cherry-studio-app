import path from 'node:path';

import { ESLint } from 'eslint';

const root = path.resolve(__dirname, '../..');
const eslint = new ESLint({ cwd: root });

async function boundaryErrors(filePath: string, source: string) {
  const [result] = await eslint.lintText(source, { filePath: path.join(root, filePath) });
  return result.messages.filter((message) =>
    ['import/no-restricted-paths', '@typescript-eslint/no-restricted-imports'].includes(
      message.ruleId ?? '',
    ),
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
    ['src/frontend/features/chat/probe.ts', "import '../plugin';"],
    ['src/frontend/features/chat/probe.ts', "import type { PluginListScreen } from '../plugin';"],
    ['src/frontend/hooks/probe.ts', "import '../features/plugin';"],
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

  it.each([
    ['src/frontend/utils/probe.ts', "import '@cherrystudio/universal/ai/builtinTools';"],
    ['src/frontend/features/chat/probe.ts', "import './components/ChatInput/ChatInput';"],
    ['src/frontend/features/chat/probe.ts', "import '@/frontend/hooks/plugin';"],
    ['src/frontend/features/plugin/probe.ts', "import '@/frontend/components/PluginIcon';"],
    ['src/frontend/utils/probe.ts', "import '@/shared/utils/providerEndpoints';"],
    [
      'src/backend/core/application/serviceRegistry.ts',
      "import '@/backend/ai/agent/runtime/pi/PiRuntimeService';",
    ],
    [
      'src/backend/ai/agent/runtime/pi/piModelResolver.ts',
      "import '@/backend/data/services/ModelService';",
    ],
  ])('preserves a permitted dependency from %s: %s', async (filePath, source) => {
    expect(await boundaryErrors(filePath, source)).toEqual([]);
  });
});
