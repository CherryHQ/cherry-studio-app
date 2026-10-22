import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { getPaintingTemplates } from '../utils/paintingTemplates';

/** The bundled templates in the app language; shared by the gallery strip and the stage. */
export function usePaintingTemplates() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => getPaintingTemplates(language, signal),
    queryKey: ['painting-templates', language],
    staleTime: Infinity,
  });
}
