/**
 * Jina catalog → registry-enrichment regression guard. `jinaFetcher` lists models by their bare id
 * (prefix stripped) and carries no capabilities of its own — capabilities/metadata all come from
 * registry enrichment, i.e. these loader lookups. Guards the two Jina fixes against a regen:
 *  - ColBERT resolves to BOTH `embedding` and `rerank` (its id has no `rerank` token, so the kind
 *    heuristic alone would tag it embedding-only and `checkModel` would never use it as a reranker).
 *  - The code-embeddings decimal API ids (`…-0.5b`) resolve to their dash-form catalog rows via the
 *    provider `apiModelId` override (they mis-normalize otherwise and lose `embedding`).
 */
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RegistryLoader } from '../registry-loader';
import { catalogDataDir as dataDir } from '../testing/catalogData';

const loader = new RegistryLoader({
  models: join(dataDir, 'models.json'),
  providers: join(dataDir, 'providers.json'),
  providerModels: join(dataDir, 'provider-models.json'),
});

describe('Jina catalog → registry enrichment', () => {
  it('resolves ColBERT to both embedding and rerank (usable as a reranker after sync)', () => {
    for (const id of ['jina-colbert-v2', 'jina-colbert-v1-en']) {
      // Keep the id in the asserted value: jest's `expect` takes no message argument.
      expect({ capabilities: loader.findModel(id)?.capabilities, id }).toEqual({
        capabilities: expect.arrayContaining(['embedding', 'rerank']),
        id,
      });
    }
  });

  it('resolves the code-embeddings decimal API ids to their dash-form embedding catalog rows', () => {
    for (const apiId of ['jina-code-embeddings-0.5b', 'jina-code-embeddings-1.5b']) {
      const override = loader.findOverride('jina', apiId);
      expect(override?.modelId).toBe(apiId.replace('.', '-'));
      expect(loader.findModel(override?.modelId ?? apiId)?.capabilities).toContain('embedding');
    }
  });
});
