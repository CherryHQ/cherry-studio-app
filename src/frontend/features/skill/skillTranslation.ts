import { cacheService } from '@/frontend/data/CacheService';
import type { TranslationModule } from '@/shared/contracts/translation';
import type { AppLanguage } from '@/shared/utils/languages';

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
    queryKey: ['skillTranslation', contentHash, language],
    initialData: read,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const saved = read();
      if (saved) return saved;

      const translated = await translation.translate({ text, language }, { signal });
      signal.throwIfAborted();
      if (translated.trim()) {
        cacheService.setPersist('skills.translations', {
          ...cacheService.getPersist('skills.translations'),
          [key]: translated,
        });
      }
      return translated;
    },
    retry: false,
    staleTime: Infinity,
  };
}
