import { useCallback, useMemo, useState } from 'react';

import type { EndpointType } from '@/shared/data/types/model';

import type { ProviderForm, ProviderFormActions } from '../context';
import { isProviderFormDirty, type ProviderFormValues } from '../utils/providerFormValues';

/**
 * The provider form's whole state, owned here so the slots stay presentational
 * and the screen keeps enough of it to drive its own header. Screens hold the
 * result and hand it to `<ProviderForm value={…}>`.
 *
 * `sourceKey` is what the draft is seeded from — a provider id, or a constant
 * for the create screen. Seeding is keyed rather than compared by identity on
 * purpose: an edit screen mounts before its provider query lands and re-seeds
 * once it does, but a background refetch of the same provider must not throw
 * away what the user has typed.
 */
export function useProviderFormDraft({
  createInitialValues,
  endpointTypes,
  isSubmitting,
  sourceKey,
}: {
  createInitialValues: () => ProviderFormValues;
  endpointTypes: readonly EndpointType[];
  isSubmitting: boolean;
  sourceKey: string;
}): ProviderForm {
  const [seed, setSeed] = useState(() => ({ key: sourceKey, values: createInitialValues() }));
  const [values, setValues] = useState(seed.values);

  if (seed.key !== sourceKey) {
    const seededValues = createInitialValues();
    setSeed({ key: sourceKey, values: seededValues });
    setValues(seededValues);
  }

  const setName = useCallback((name: string) => setValues((current) => ({ ...current, name })), []);
  const reset = useCallback(
    (nextValues?: ProviderFormValues) => {
      const nextSeed = nextValues ?? createInitialValues();
      setSeed({ key: sourceKey, values: nextSeed });
      setValues(nextSeed);
    },
    [createInitialValues, sourceKey],
  );
  const setApiKey = useCallback(
    (apiKey: string) => setValues((current) => ({ ...current, apiKey })),
    [],
  );
  const setAvatarUri = useCallback(
    (avatarUri: string | null) => setValues((current) => ({ ...current, avatarUri })),
    [],
  );
  const setEndpointUrl = useCallback((endpoint: EndpointType, value: string) => {
    setValues((current) =>
      current.endpointUrls[endpoint] === value
        ? current
        : { ...current, endpointUrls: { ...current.endpointUrls, [endpoint]: value } },
    );
  }, []);
  const actions = useMemo<ProviderFormActions>(
    () => ({ reset, setApiKey, setAvatarUri, setEndpointUrl, setName }),
    [reset, setApiKey, setAvatarUri, setEndpointUrl, setName],
  );

  return useMemo(
    () => ({
      actions,
      meta: {
        baseUrlEndpoint: endpointTypes[0] ?? null,
        canSubmit: values.name.trim().length > 0 && !isSubmitting,
        isDirty: isProviderFormDirty({ endpointTypes, initialValues: seed.values, values }),
        isSubmitting,
      },
      state: values,
    }),
    [actions, endpointTypes, isSubmitting, seed.values, values],
  );
}
