import { useEffect, useState } from 'react';

import { useBackendModule } from '@/frontend/data';
import type { TranslationAvailability, TranslationSurface } from '@/shared/contracts/translation';

export function useTranslationAvailability(surface: TranslationSurface) {
  const module = useBackendModule('translation');
  const [availability, setAvailability] = useState<TranslationAvailability | null>(null);
  useEffect(() => {
    let disposed = false;
    let revision = 0;
    const refresh = () => {
      const current = ++revision;
      void module
        .getAvailability(surface)
        .then((value) => {
          if (!disposed && current === revision) setAvailability(value);
        })
        .catch(() => {
          if (!disposed && current === revision)
            setAvailability({
              status: 'unavailable',
              reason: 'configurationStale',
              targetLanguage: 'en-US',
            });
        });
    };
    const stop = module.subscribeAvailability(refresh);
    refresh();
    return () => {
      disposed = true;
      stop();
    };
  }, [module, surface]);
  return availability;
}
