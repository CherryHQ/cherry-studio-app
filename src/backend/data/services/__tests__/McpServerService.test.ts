import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { DbService } from '@/backend/data/db/DbService';

import { McpServerService } from '../McpServerService';
import { createTestDb } from './_testDb';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

describe('McpServerService', () => {
  let sqlite: DatabaseSync;
  let dbService: DbService;
  let service: McpServerService;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
    ({ dbService } = createTestDb(sqlite));
    // Data services resolve `DbService` from `application`, so the fake is
    // installed as a host override instead of being passed to constructors.
    await installTestHost({ DbService: dbService });
    service = new McpServerService();
  });

  afterEach(async () => {
    await uninstallTestHost();
    sqlite.close();
  });

  it('creates a disabled server with a trimmed name', async () => {
    const server = await service.create({
      endpointUrl: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token' },
      name: ' Example ',
    });

    expect(server).toMatchObject({
      disabledTools: [],
      endpointUrl: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token' },
      isEnabled: false,
      name: 'Example',
    });
    expect(server.createdAt).toEqual(expect.any(String));
    expect(server.updatedAt).toEqual(expect.any(String));
    await expect(service.getById(server.id)).resolves.toEqual(server);
  });

  it('rejects anything the connection contract does not own', async () => {
    await expect(
      service.create({ endpointUrl: 'not-a-url', name: 'Invalid' }),
    ).rejects.toBeDefined();
    await expect(
      service.create({ endpointUrl: 'https://a.example/mcp', name: '  ' }),
    ).rejects.toBeDefined();

    const server = await service.create({ endpointUrl: 'https://b.example/mcp', name: 'Valid' });
    await expect(
      service.update(server.id, { command: 'unsupported' } as never),
    ).rejects.toBeDefined();
  });

  it('updates and clears custom HTTP headers', async () => {
    const server = await service.create({ endpointUrl: 'https://a.example/mcp', name: 'Headers' });

    await expect(
      service.update(server.id, { headers: { 'X-API-Key': 'secret' } }),
    ).resolves.toMatchObject({ headers: { 'X-API-Key': 'secret' } });
    await expect(service.update(server.id, { headers: {} })).resolves.toMatchObject({
      headers: {},
    });
  });

  it('lists by id and enabled state, oldest first', async () => {
    const first = await service.create({
      endpointUrl: 'https://first.example/mcp',
      isEnabled: true,
      name: 'First',
    });
    const second = await service.create({
      endpointUrl: 'https://second.example/mcp',
      name: 'Second',
    });

    const all = await service.list();
    expect(all).toMatchObject({ page: 1, total: 2 });
    expect(all.items.map((server) => server.id)).toEqual([first.id, second.id]);
    expect((await service.list({ isEnabled: true })).items.map((server) => server.id)).toEqual([
      first.id,
    ]);
    expect((await service.list({ id: second.id })).items.map((server) => server.id)).toEqual([
      second.id,
    ]);
  });

  it('rejects duplicate names on create and update', async () => {
    await service.create({ endpointUrl: 'https://a.example/mcp', name: 'Dup' });
    await expect(
      service.create({ endpointUrl: 'https://b.example/mcp', name: 'Dup' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const other = await service.create({ endpointUrl: 'https://c.example/mcp', name: 'Other' });
    await expect(service.update(other.id, { name: 'Dup' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    // Renaming a server to the name it already has is not a conflict with itself.
    await expect(
      service.update(other.id, { isEnabled: true, name: 'Other' }),
    ).resolves.toMatchObject({ isEnabled: true, name: 'Other' });
  });

  it('stores the disabled tool rules as a set, and can clear them', async () => {
    const server = await service.create({ endpointUrl: 'https://a.example/mcp', name: 'Rules' });

    // The writer sends the whole list, so a duplicate is a caller slip rather
    // than a second rule; storing it twice would survive every later patch.
    const disabled = await service.update(server.id, { disabledTools: ['read', 'read', 'write'] });
    expect(disabled.disabledTools).toEqual(['read', 'write']);
    await expect(service.getById(server.id)).resolves.toMatchObject({
      disabledTools: ['read', 'write'],
    });

    await expect(service.update(server.id, { disabledTools: [] })).resolves.toMatchObject({
      disabledTools: [],
    });
  });

  // A write issued outside withWriteTx would join whichever transaction is
  // open on the shared connection and vanish with that transaction's rollback.
  it.each([
    [
      'create',
      async () => () => service.create({ endpointUrl: 'https://a.example/mcp', name: 'Queued' }),
    ],
    [
      'update',
      async () => {
        const server = await service.create({ endpointUrl: 'https://a.example/mcp', name: 'A' });
        return () => service.update(server.id, { name: 'Queued' });
      },
    ],
  ])('queues %s behind an open write transaction instead of joining it', async (_, arrange) => {
    const write = await arrange();
    let releaseOuter!: () => void;
    const outerGate = new Promise<void>((resolve) => {
      releaseOuter = resolve;
    });
    const outer = dbService.withWriteTx(async () => {
      await outerGate;
      throw new Error('outer transaction rolled back');
    });

    const written = write();
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseOuter();

    await expect(outer).rejects.toThrow('outer transaction rolled back');
    const server = await written;
    await expect(service.getById(server.id)).resolves.toMatchObject({ name: 'Queued' });
  });

  it('reports a missing server rather than silently succeeding', async () => {
    await expect(service.getById('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.update('missing', { name: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.delete('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
