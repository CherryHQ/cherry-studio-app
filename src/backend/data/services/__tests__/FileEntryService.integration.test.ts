import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { FileEntrySchema } from '@/shared/data/types/file';

import { createServiceTestDatabase } from '../../serviceTestDatabase';
import { FileEntryService } from '../FileEntryService';

const HOUR = 60 * 60 * 1000;
const id = (suffix: number) => `00000000-0000-7000-8000-${suffix.toString().padStart(12, '0')}`;

describe('FileEntryService integration', () => {
  const now = 10 * HOUR;
  let testDatabase: ReturnType<typeof createServiceTestDatabase>;
  let service: FileEntryService;
  // Cases below are about identity, paging, and deletion. They still have to
  // state an origin, so this keeps the one they do not care about out of view.
  const createImported = (input: Omit<Parameters<FileEntryService['create']>[0], 'provenance'>) =>
    service.create({ ...input, provenance: 'imported' });

  beforeEach(async () => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    testDatabase = createServiceTestDatabase();
    await installTestHost({ DbService: testDatabase.dbService });
    service = new FileEntryService();
  });

  afterEach(async () => {
    await uninstallTestHost();
    testDatabase.sqlite.close();
    jest.restoreAllMocks();
  });

  it('creates a validated entry and reads it back through every lookup', async () => {
    const entry = await createImported({
      filename: 'report.pdf',
      id: id(1),
      mediaType: 'application/pdf',
      size: 12,
    });

    expect(entry).toEqual(
      FileEntrySchema.parse({
        createdAt: now,
        filename: 'report.pdf',
        id: id(1),
        mediaType: 'application/pdf',
        provenance: 'imported',
        size: 12,
        updatedAt: now,
      }),
    );
    await expect(service.findById(id(1))).resolves.toEqual(entry);
    await expect(service.get(id(1))).resolves.toEqual(entry);
    await expect(service.getById(id(1))).resolves.toEqual(entry);
    // The row itself: v1 writes no deleted_at (reserved for the future trash).
    expect(testDatabase.sqlite.prepare('SELECT * FROM file_entry').get()).toEqual({
      created_at: now,
      deleted_at: null,
      filename: 'report.pdf',
      id: id(1),
      media_type: 'application/pdf',
      provenance: 'imported',
      size: 12,
      updated_at: now,
    });
  });

  it('rejects an unsafe filename without writing a row', async () => {
    await expect(
      createImported({
        filename: 'nested/escape.pdf',
        id: id(2),
        mediaType: 'application/pdf',
        size: 1,
      }),
    ).rejects.toThrow();

    expect(testDatabase.sqlite.prepare('SELECT COUNT(*) AS count FROM file_entry').get()).toEqual({
      count: 0,
    });
  });

  it('distinguishes the nullable lookup from the throwing lookup for a missing id', async () => {
    await expect(service.findById(id(9))).resolves.toBeNull();
    await expect(service.getById(id(9))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('batch-resolves only live file entries for submission-time validation', async () => {
    const available = await createImported({
      filename: 'available.png',
      id: id(1),
      mediaType: 'image/png',
      size: 12,
    });
    await createImported({
      filename: 'deleted.png',
      id: id(2),
      mediaType: 'image/png',
      size: 24,
    });
    testDatabase.sqlite
      .prepare('UPDATE file_entry SET deleted_at = ? WHERE id = ?')
      .run(now + HOUR, id(2));

    await expect(service.findAvailableByIds([id(2), id(1), id(1), id(9)])).resolves.toEqual([
      available,
    ]);
    await expect(service.findById(id(2))).resolves.toMatchObject({ id: id(2) });
    await expect(service.getById(id(2))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.findAvailableByIds([])).resolves.toEqual([]);
  });

  it('deletes an entry idempotently', async () => {
    await createImported({ filename: 'note.txt', id: id(3), mediaType: 'text/plain', size: 1 });

    await service.delete(id(3));
    await expect(service.findById(id(3))).resolves.toBeNull();
    await expect(service.delete(id(3))).resolves.toBeUndefined();
  });

  describe('listByCursor', () => {
    // Distinct timestamps, so the major sort is what orders the page and the
    // `(createdAt, id)` tie-break is exercised separately below.
    const seed = async () => {
      const entries = [
        { filename: 'alpha.png', mediaType: 'image/png' },
        { filename: 'beta.pdf', mediaType: 'application/pdf' },
        { filename: 'gamma photo.jpeg', mediaType: 'image/jpeg' },
        { filename: 'delta.txt', mediaType: 'text/plain' },
      ];
      for (const [index, entry] of entries.entries()) {
        jest.spyOn(Date, 'now').mockReturnValue(now + index * HOUR);
        await createImported({ ...entry, id: id(index + 1), size: index + 1 });
      }
    };
    const filenamesOf = (page: { items: { filename: string }[] }) =>
      page.items.map((item) => item.filename);

    it('returns entries newest first and pages through the cursor', async () => {
      await seed();

      const first = await service.listByCursor({ limit: 2 });
      expect(filenamesOf(first)).toEqual(['delta.txt', 'gamma photo.jpeg']);
      expect(first.nextCursor).toBeDefined();

      const second = await service.listByCursor({ cursor: first.nextCursor, limit: 2 });
      expect(filenamesOf(second)).toEqual(['beta.pdf', 'alpha.png']);
      expect(second.nextCursor).toBeUndefined();
    });

    it('breaks a createdAt tie by id so a page boundary neither skips nor repeats', async () => {
      await createImported({ filename: 'a.png', id: id(1), mediaType: 'image/png', size: 1 });
      await createImported({ filename: 'b.png', id: id(2), mediaType: 'image/png', size: 1 });

      const first = await service.listByCursor({ limit: 1 });
      const second = await service.listByCursor({ cursor: first.nextCursor, limit: 1 });
      expect(filenamesOf(first)).toEqual(['b.png']);
      expect(filenamesOf(second)).toEqual(['a.png']);
    });

    it('falls back to the first page when the cursor is unparseable', async () => {
      await seed();

      await expect(
        service.listByCursor({ cursor: 'not-a-cursor', limit: 1 }).then(filenamesOf),
      ).resolves.toEqual(['delta.txt']);
    });
  });
});
