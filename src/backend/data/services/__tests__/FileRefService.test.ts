import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';

import { createServiceTestDatabase } from '../../serviceTestDatabase';
import { FileEntryService } from '../FileEntryService';
import { FileRefService } from '../FileRefService';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000000'),
}));

const fileId = '00000000-0000-7000-8000-000000000001';
const sourceIds = {
  chat: '00000000-0000-7000-8000-000000000002',
  job: '00000000-0000-7000-8000-000000000003',
  miniApp: 'mini-app',
  painting: '00000000-0000-4000-8000-000000000004',
  provider: 'provider',
};

describe('FileRefService', () => {
  let testDatabase: ReturnType<typeof createServiceTestDatabase>;
  let service: FileRefService;

  beforeEach(async () => {
    testDatabase = createServiceTestDatabase();
    await installTestHost({ DbService: testDatabase.dbService });
    service = new FileRefService();
    seedFiveSources(testDatabase.sqlite);
  });

  afterEach(async () => {
    await uninstallTestHost();
    testDatabase.sqlite.close();
  });

  it('projects and orders all five persistent reference variants', async () => {
    const refs = await service.findByEntryId(fileId);
    expect(refs.map((ref) => ref.sourceType)).toEqual([
      'chat_message',
      'painting',
      'job',
      'provider_logo',
      'mini_app_logo',
    ]);
    await expect(
      service.findBySource({ sourceId: sourceIds.job, sourceType: 'job' }),
    ).resolves.toEqual([expect.objectContaining({ role: 'mask', sourceType: 'job' })]);
    await expect(
      service.findBySource({ sourceId: sourceIds.provider, sourceType: 'provider_logo' }),
    ).resolves.toEqual([expect.objectContaining({ sourceType: 'provider_logo' })]);
  });

  it('aggregates batch counts and rechecks the same registry inside a transaction', async () => {
    const missing = '00000000-0000-7000-8000-000000000099';
    const counts = await service.countByEntryIds([fileId, missing]);
    expect(counts.get(fileId)).toBe(5);
    expect(counts.has(missing)).toBe(false);
    await expect(
      testDatabase.dbService.withWriteTx((tx) =>
        service.countPersistentRefsByEntryIdTx(tx, fileId),
      ),
    ).resolves.toBe(5);
  });

  it('protects a cleanup candidate until every registered source releases it', async () => {
    const entries = new FileEntryService();
    await expect(
      entries.findCleanupCandidates({ graceMs: 60 * 60 * 1000, limit: 100 }),
    ).resolves.toEqual([]);

    testDatabase.sqlite.exec(`
      DELETE FROM chat_message_file_ref;
      DELETE FROM painting_file_ref;
      DELETE FROM job_file_ref;
      DELETE FROM provider_logo_file_ref;
      DELETE FROM mini_app_logo_file_ref;
    `);
    await expect(
      entries.findCleanupCandidates({ graceMs: 60 * 60 * 1000, limit: 100 }),
    ).resolves.toEqual([expect.objectContaining({ id: fileId })]);
  });
});

function seedFiveSources(database: ReturnType<typeof createServiceTestDatabase>['sqlite']): void {
  database.exec(`
    INSERT INTO file_entry
      (id, origin, name, ext, size, content_hash, external_path, cleanup_policy,
       created_at, updated_at, deleted_at)
    VALUES ('${fileId}', 'internal', 'shared', 'png', 1, NULL, NULL,
      'delete_when_unreferenced', 1, 1, NULL);

    INSERT INTO topic (id, name, order_key, created_at, updated_at)
    VALUES ('topic', 'Topic', 'a0', 1, 1);
    INSERT INTO message
      (id, parent_id, topic_id, role, data, status, siblings_group_id, created_at, updated_at)
    VALUES ('${sourceIds.chat}', NULL, 'topic', 'root', '{"parts":[]}', 'success', 0, 1, 1);
    INSERT INTO painting (id, provider_id, model_id, prompt, order_key, created_at, updated_at)
    VALUES ('${sourceIds.painting}', 'provider', NULL, 'prompt', 'a0', 1, 1);
    INSERT INTO job (id, type, status, queue, scheduled_at, input, created_at, updated_at)
    VALUES ('${sourceIds.job}', 'image', 'pending', 'default', 1, '{}', 1, 1);
    INSERT INTO user_provider (provider_id, name, order_key, created_at, updated_at)
    VALUES ('${sourceIds.provider}', 'Provider', 'a0', 1, 1);
    INSERT INTO mini_app (app_id, name, url, order_key, created_at, updated_at)
    VALUES ('${sourceIds.miniApp}', 'Mini App', 'https://example.com', 'a0', 1, 1);

    INSERT INTO chat_message_file_ref
      (id, file_entry_id, source_id, role, created_at, updated_at)
    VALUES ('00000000-0000-4000-8000-000000000010', '${fileId}', '${sourceIds.chat}',
      'attachment', 1, 1);
    INSERT INTO painting_file_ref
      (id, file_entry_id, source_id, role, created_at, updated_at)
    VALUES ('00000000-0000-4000-8000-000000000011', '${fileId}', '${sourceIds.painting}',
      'input', 2, 2);
    INSERT INTO job_file_ref
      (id, file_entry_id, source_id, role, created_at, updated_at)
    VALUES ('00000000-0000-4000-8000-000000000012', '${fileId}', '${sourceIds.job}',
      'mask', 3, 3);
    INSERT INTO provider_logo_file_ref
      (id, file_entry_id, source_id, created_at, updated_at)
    VALUES ('00000000-0000-4000-8000-000000000013', '${fileId}', '${sourceIds.provider}', 4, 4);
    INSERT INTO mini_app_logo_file_ref
      (id, file_entry_id, source_id, created_at, updated_at)
    VALUES ('00000000-0000-4000-8000-000000000014', '${fileId}', '${sourceIds.miniApp}', 5, 5);
  `);
}
