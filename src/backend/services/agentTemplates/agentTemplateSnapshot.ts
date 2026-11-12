import { loggerService } from '@logger';
import { File, Paths } from 'expo-file-system';
import { z } from 'zod';

import {
  AgentTemplateCatalogSchema,
  type AgentTemplateCatalog,
  type AgentTemplateLanguage,
} from '@/shared/data/types/agentTemplate';

const logger = loggerService.withContext('AgentTemplateSnapshot');
const SnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  fetchedAt: z.number().int().positive(),
  catalog: AgentTemplateCatalogSchema,
});
const slots = ['a', 'b'] as const;
export type AgentTemplateSnapshot = z.infer<typeof SnapshotSchema> & {
  slot: (typeof slots)[number];
};

function snapshotFile(language: AgentTemplateLanguage, slot: AgentTemplateSnapshot['slot']) {
  return new File(Paths.document, 'agent-templates', `${language}-${slot}.json`);
}

export async function readAgentTemplateSnapshot(
  language: AgentTemplateLanguage,
): Promise<AgentTemplateSnapshot | null> {
  const snapshots: AgentTemplateSnapshot[] = [];
  for (const slot of slots) {
    try {
      const file = snapshotFile(language, slot);
      if (!file.exists) continue;
      if (file.size > 10 * 1024 * 1024) throw new Error('Saved template catalog is too large');
      const snapshot = SnapshotSchema.parse(JSON.parse(await file.text()));
      if (snapshot.catalog.language !== language)
        throw new Error('Saved template language mismatch');
      snapshots.push({ ...snapshot, slot });
    } catch (error) {
      logger.warn('Could not read a saved template catalog', error as Error, { language, slot });
    }
  }
  return snapshots.sort((left, right) => right.fetchedAt - left.fetchedAt)[0] ?? null;
}

/** The inactive slot preserves the last valid catalog through interrupted writes. */
export async function writeAgentTemplateSnapshot(
  catalog: AgentTemplateCatalog,
  previous: AgentTemplateSnapshot | null,
): Promise<AgentTemplateSnapshot> {
  const slot = previous?.slot === 'a' ? 'b' : 'a';
  const snapshot = {
    schemaVersion: 1 as const,
    fetchedAt: Math.max(Date.now(), (previous?.fetchedAt ?? 0) + 1),
    catalog,
  };
  const destination = snapshotFile(catalog.language, slot);
  destination.parentDirectory.create({ intermediates: true, idempotent: true });
  const temporary = new File(destination.parentDirectory, `${destination.name}.tmp`);
  temporary.create({ overwrite: true });
  temporary.writeSync(JSON.stringify(snapshot));
  await temporary.move(destination, { overwrite: true });
  return { ...snapshot, slot };
}
