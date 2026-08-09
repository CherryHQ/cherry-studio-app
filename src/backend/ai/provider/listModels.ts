import {
  listModels as listPortableModels,
  type ModelListContext as PortableModelListContext,
} from '@cherrystudio/ai-runtime/provider';
import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

import { defaultAppHeaders } from '@/backend/utils/defaultAppHeaders';

export type ModelListContext = Omit<PortableModelListContext, 'appHeaders'>;

export function listModels(
  provider: Provider,
  context: ModelListContext,
  abortSignal?: AbortSignal,
  options?: { throwOnError?: boolean },
): Promise<Partial<Model>[]> {
  return listPortableModels(
    provider,
    { ...context, appHeaders: defaultAppHeaders() },
    abortSignal,
    options,
  );
}
