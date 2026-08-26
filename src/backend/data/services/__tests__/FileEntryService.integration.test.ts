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
    const entry = await service.create({
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
      size: 12,
      updated_at: now,
    });
  });

  it('rejects an unsafe filename without writing a row', async () => {
    await expect(
      service.create({
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

  it('deletes an entry idempotently', async () => {
    await service.create({ filename: 'note.txt', id: id(3), mediaType: 'text/plain', size: 1 });

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
        await service.create({ ...entry, id: id(index + 1), size: index + 1 });
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
      await service.create({ filename: 'a.png', id: id(1), mediaType: 'image/png', size: 1 });
      await service.create({ filename: 'b.png', id: id(2), mediaType: 'image/png', size: 1 });

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
