import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/errors';
import type {
  CreateTranslateLanguageDto,
  UpdateTranslateLanguageDto,
} from '@cherrystudio/universal/data/api/schemas/translate';
import { parsePersistedLangCode } from '@cherrystudio/universal/data/preference/preferenceTypes';
import type { TranslateLanguage } from '@cherrystudio/universal/data/types/translate';
import { asc, eq } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { translateLanguageTable } from '@/backend/data/db/schemas/translateLanguage';

import { timestampToISO } from './utils/rowMappers';

function rowToTranslateLanguage(
  row: typeof translateLanguageTable.$inferSelect,
): TranslateLanguage {
  return {
    createdAt: timestampToISO(row.createdAt),
    emoji: row.emoji,
    langCode: parsePersistedLangCode(row.langCode),
    updatedAt: timestampToISO(row.updatedAt),
    value: row.value,
  };
}

export class TranslateLanguageService {
  /**
   * Resolved per call rather than injected once, so the instance holds no
   * reference to a particular host generation and a replaced host cannot leave
   * this singleton writing to a closed connection.
   */
  private get dbService() {
    return application.get('DbService');
  }

  async list(): Promise<TranslateLanguage[]> {
    const rows = await this.dbService
      .getDb()
      .select()
      .from(translateLanguageTable)
      .orderBy(asc(translateLanguageTable.createdAt));
    return rows.map(rowToTranslateLanguage);
  }

  async getByLangCode(langCode: string): Promise<TranslateLanguage> {
    const [row] = await this.dbService
      .getDb()
      .select()
      .from(translateLanguageTable)
      .where(eq(translateLanguageTable.langCode, langCode))
      .limit(1);
    if (!row) throw DataApiErrorFactory.notFound('TranslateLanguage', langCode);
    return rowToTranslateLanguage(row);
  }

  async create(dto: CreateTranslateLanguageDto): Promise<TranslateLanguage> {
    const langCode = parsePersistedLangCode(dto.langCode.toLowerCase());
    const [row] = await this.dbService.withWriteTx((tx) =>
      tx
        .insert(translateLanguageTable)
        .values({ emoji: dto.emoji, langCode, value: dto.value })
        .returning(),
    );
    if (!row) throw new Error('Insert did not return a translate language');
    return rowToTranslateLanguage(row);
  }

  async update(langCode: string, dto: UpdateTranslateLanguageDto): Promise<TranslateLanguage> {
    return this.dbService.withWriteTx(async (tx) => {
      const [current] = await tx
        .select()
        .from(translateLanguageTable)
        .where(eq(translateLanguageTable.langCode, langCode))
        .limit(1);
      if (!current) throw DataApiErrorFactory.notFound('TranslateLanguage', langCode);
      const updates: Partial<typeof translateLanguageTable.$inferInsert> = {};
      if (dto.value !== undefined) updates.value = dto.value;
      if (dto.emoji !== undefined) updates.emoji = dto.emoji;
      if (Object.keys(updates).length === 0) return rowToTranslateLanguage(current);
      const [row] = await tx
        .update(translateLanguageTable)
        .set(updates)
        .where(eq(translateLanguageTable.langCode, langCode))
        .returning();
      if (!row) throw DataApiErrorFactory.notFound('TranslateLanguage', langCode);
      return rowToTranslateLanguage(row);
    });
  }

  async delete(langCode: string): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      const [row] = await tx
        .delete(translateLanguageTable)
        .where(eq(translateLanguageTable.langCode, langCode))
        .returning({ langCode: translateLanguageTable.langCode });
      if (!row) throw DataApiErrorFactory.notFound('TranslateLanguage', langCode);
    });
  }
}

export const translateLanguageService = new TranslateLanguageService();
