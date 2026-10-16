import { cacheService } from '@/frontend/data/CacheService';
import type { TranslationModule } from '@/shared/contracts/translation';
import { APP_LANGUAGES, type AppLanguage } from '@/shared/utils/languages';

/** Restore the most recently saved target for this document revision. */
export function getCachedSkillTranslationLanguage(contentHash: string): AppLanguage | undefined {
  const saved = cacheService.getPersist('skills.translations');
  for (const [key, text] of Object.entries(saved).toReversed()) {
    if (typeof text !== 'string' || !text.trim()) continue;
    const language = APP_LANGUAGES.find(({ value }) => key === `${contentHash}:${value}`);
    if (language) return language.value;
  }
  return undefined;
}

export function skillTranslationQueryOptions(
  translation: TranslationModule,
  { contentHash, language, text }: { contentHash: string; language: AppLanguage; text: string },
) {
  const key = `${contentHash}:${language}`;
  const read = () => {
    const saved = cacheService.getPersist('skills.translations')?.[key];
    return typeof saved === 'string' && saved.trim() ? saved : undefined;
  };

  return {
    queryKey: ['skillTranslation', key],
    initialData: read,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const saved = read();
      if (saved) return saved;

      const translated = await translation.translate({ text, language }, { signal });
      cacheService.setPersist('skills.translations', {
        ...cacheService.getPersist('skills.translations'),
        [key]: translated,
      });
      return translated;
    },
    retry: false,
    staleTime: Infinity,
  };
}
