import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

type MigrationJournal = { entries: { tag: string }[] };
type SqlValue = bigint | number | string | null;

const baseRecord: Record<string, SqlValue> = {
  id: '00000000-0000-7000-8000-000000000000',
  request_id: 'request-1',
  record_kind: 'invocation',
  request_count: 1,
  provider_id: 'openrouter',
  model_id: 'openai/gpt-5',
  modality: 'language',
  api_key_attribution: 'unknown',
  created_at: 1_785_427_200_000,
};

describe('ai_usage_record migration', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON');
    applyAllMigrations(database);
  });

  afterEach(() => {
    database.close();
  });

  it('creates the desktop-compatible table empty, indexed, and without foreign keys', () => {
    const columns = database.prepare("PRAGMA table_info('ai_usage_record')").all() as {
      name: string;
    }[];
    const indexes = database.prepare("PRAGMA index_list('ai_usage_record')").all() as {
      name: string;
      unique: number;
    }[];

    expect(columns.map(({ name }) => name)).toEqual([
      'id',
      'request_id',
      'record_kind',
      'request_count',
      'message_kind',
      'message_id',
      'provider_id',
      'provider_name',
      'model_id',
      'model_name',
      'source_type',
      'source_id',
      'source_name',
      'source_icon',
      'modality',
      'api_key_id',
      'api_key_label',
      'api_key_masked',
      'api_key_attribution',
      'auth_method',
      'input_tokens',
      'output_tokens',
      'total_tokens',
      'reasoning_tokens',
      'no_cache_tokens',
      'cache_read_tokens',
      'cache_write_tokens',
      'image_count',
      'cost',
      'cost_currency',
      'cost_source',
      'cost_breakdown',
      'pricing_snapshot',
      'time_first_token_ms',
      'time_completion_ms',
      'time_thinking_ms',
      'created_at',
    ]);
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'ai_usage_record_request_id_idx', unique: 1 }),
        expect.objectContaining({ name: 'ai_usage_record_created_at_idx', unique: 0 }),
        expect.objectContaining({ name: 'ai_usage_record_message_created_idx', unique: 0 }),
        expect.objectContaining({ name: 'ai_usage_record_provider_created_idx', unique: 0 }),
        expect.objectContaining({ name: 'ai_usage_record_model_created_idx', unique: 0 }),
        expect.objectContaining({ name: 'ai_usage_record_api_key_created_idx', unique: 0 }),
        expect.objectContaining({ name: 'ai_usage_record_source_created_idx', unique: 0 }),
      ]),
    );
    expect(database.prepare("PRAGMA foreign_key_list('ai_usage_record')").all()).toEqual([]);
    expect(database.prepare('SELECT count(*) AS count FROM ai_usage_record').get()).toEqual({
      count: 0,
    });
  });

  it('stores cost and pricing JSON without changing their values', () => {
    const costBreakdown = { cacheRead: 0.0001, input: 0.001, output: 0.002 };
    const pricingSnapshot = {
      capturedAt: '2026-07-30T00:00:00.000Z',
      currency: 'USD',
      inputPerMillionTokens: 10,
      outputPerMillionTokens: 20,
    };
    insertRecord(database, {
      ...baseRecord,
      cost: 0.0031,
      cost_currency: 'USD',
      cost_source: 'computed',
      cost_breakdown: JSON.stringify(costBreakdown),
      pricing_snapshot: JSON.stringify(pricingSnapshot),
    });

    const row = database
      .prepare('SELECT cost_breakdown, pricing_snapshot FROM ai_usage_record')
      .get() as { cost_breakdown: string; pricing_snapshot: string };
    expect(JSON.parse(row.cost_breakdown)).toEqual(costBreakdown);
    expect(JSON.parse(row.pricing_snapshot)).toEqual(pricingSnapshot);
  });

  it('enforces request idempotency', () => {
    insertRecord(database, baseRecord);
    expect(() =>
      insertRecord(database, {
        ...baseRecord,
        id: '00000000-0000-7000-8000-000000000001',
      }),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it.each([
    ['invalid enum', { record_kind: 'invalid' }],
    ['negative count', { input_tokens: -1 }],
    ['fractional count', { input_tokens: 1.5 }],
    ['unpaired message identity', { message_kind: 'chat' }],
    ['unpaired source identity', { source_type: 'assistant' }],
    ['incomplete cost tuple', { cost: 1 }],
    [
      'unknown attribution with key identity',
      { api_key_attribution: 'unknown', api_key_id: 'key-1' },
    ],
    ['auth attribution without method', { api_key_attribution: 'auth' }],
    ['language invocation with image count', { image_count: 1 }],
  ])('rejects %s', (_name, overrides) => {
    expect(() => insertRecord(database, { ...baseRecord, ...overrides })).toThrow(
      /constraint failed/i,
    );
  });

  it('accepts valid explicit, auth, image, and legacy identities', () => {
    insertRecord(database, {
      ...baseRecord,
      api_key_attribution: 'explicit',
      api_key_id: 'key-1',
      api_key_label: 'Primary',
      api_key_masked: 'sk-****',
    });
    insertRecord(database, {
      ...baseRecord,
      id: '00000000-0000-7000-8000-000000000001',
      request_id: 'request-2',
      api_key_attribution: 'auth',
      auth_method: 'oauth',
    });
    insertRecord(database, {
      ...baseRecord,
      id: '00000000-0000-7000-8000-000000000002',
      request_id: 'request-3',
      modality: 'image',
      image_count: 2,
    });
    insertRecord(database, {
      id: '00000000-0000-7000-8000-000000000003',
      request_id: 'legacy:chat:message-1',
      record_kind: 'legacy-aggregate',
      request_count: 3,
      message_kind: 'chat',
      message_id: 'message-1',
      modality: 'language',
      api_key_attribution: 'unknown',
      created_at: 1_785_427_200_000,
    });

    expect(database.prepare('SELECT count(*) AS count FROM ai_usage_record').get()).toEqual({
      count: 4,
    });
  });
});

function insertRecord(database: DatabaseSync, record: Record<string, SqlValue>): void {
  const entries = Object.entries(record);
  const columns = entries.map(([column]) => `"${column}"`).join(', ');
  const placeholders = entries.map(() => '?').join(', ');
  database
    .prepare(`INSERT INTO ai_usage_record (${columns}) VALUES (${placeholders})`)
    .run(...entries.map(([, value]) => value));
}

function applyAllMigrations(database: DatabaseSync): void {
  const directory = `${process.cwd()}/migrations/sqlite-drizzle`;
  const journal = JSON.parse(
    readFileSync(`${directory}/meta/_journal.json`, 'utf8'),
  ) as MigrationJournal;

  for (const { tag } of journal.entries) {
    const migration = readFileSync(`${directory}/${tag}.sql`, 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) database.exec(statement);
    }
  }
}
