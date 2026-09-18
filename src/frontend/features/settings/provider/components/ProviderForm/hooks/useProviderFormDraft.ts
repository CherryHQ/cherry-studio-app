import { useCallback, useMemo, useState } from 'react';

import type { EndpointType } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { CHAT_ENDPOINT_TYPES } from '@/shared/utils/providerEndpoints';

import {
  hasConfiguredCustomProviderTextEndpoint,
  normalizeCustomProviderDefaultEndpoint,
} from '../../../apiService/utils/providerApiServiceEndpointRules';
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
  defaultEndpointNeedsRepair = false,
  endpointTypes,
  initiallyDirty = false,
  isSubmitting,
  normalizeCustomEndpoints = false,
  provider,
  sourceKey,
}: {
  createInitialValues: () => ProviderFormValues;
  defaultEndpointNeedsRepair?: boolean;
  endpointTypes: readonly EndpointType[];
  initiallyDirty?: boolean;
  isSubmitting: boolean;
  normalizeCustomEndpoints?: boolean;
  provider?: Provider;
  sourceKey: string;
}): ProviderForm {
  const [seed, setSeed] = useState(() => ({
    defaultEndpointNeedsRepair,
    isInitiallyDirty: initiallyDirty,
    key: sourceKey,
    values: createInitialValues(),
  }));
  const [values, setValues] = useState(seed.values);
  const [hasEditedEndpointUrls, setHasEditedEndpointUrls] = useState(false);

  if (seed.key !== sourceKey) {
    const seededValues = createInitialValues();
    setSeed({
      defaultEndpointNeedsRepair,
      isInitiallyDirty: initiallyDirty,
      key: sourceKey,
      values: seededValues,
    });
    setValues(seededValues);
    setHasEditedEndpointUrls(false);
  }

  const setName = useCallback((name: string) => setValues((current) => ({ ...current, name })), []);
  const reset = useCallback(
    (nextValues?: ProviderFormValues) => {
      const nextSeed = nextValues ?? createInitialValues();
      setSeed({
        defaultEndpointNeedsRepair: nextValues ? false : defaultEndpointNeedsRepair,
        isInitiallyDirty: nextValues ? false : initiallyDirty,
        key: sourceKey,
        values: nextSeed,
      });
      setValues(nextSeed);
      setHasEditedEndpointUrls(false);
    },
    [createInitialValues, defaultEndpointNeedsRepair, initiallyDirty, sourceKey],
  );
  const setApiKey = useCallback(
    (apiKey: string) => setValues((current) => ({ ...current, apiKey })),
    [],
  );
  const setAvatarUri = useCallback(
    (avatarUri: string | null) => setValues((current) => ({ ...current, avatarUri })),
    [],
  );
  const setEndpointUrl = useCallback(
    (endpoint: EndpointType, value: string) => {
      setHasEditedEndpointUrls(true);
      setValues((current) => {
        if (current.endpointUrls[endpoint] === value) {
          return current;
        }

        const endpointUrls = { ...current.endpointUrls, [endpoint]: value };
        return {
          ...current,
          defaultChatEndpoint:
            normalizeCustomEndpoints && hasConfiguredCustomProviderTextEndpoint(endpointUrls)
              ? normalizeCustomProviderDefaultEndpoint(endpointUrls, current.defaultChatEndpoint)
              : current.defaultChatEndpoint,
          endpointUrls,
        };
      });
    },
    [normalizeCustomEndpoints],
  );
  const setDefaultChatEndpoint = useCallback((defaultChatEndpoint: EndpointType) => {
    setValues((current) =>
      current.defaultChatEndpoint === defaultChatEndpoint
        ? current
        : { ...current, defaultChatEndpoint },
    );
  }, []);
  const replaceTextEndpoint = useCallback((endpoint: EndpointType) => {
    setHasEditedEndpointUrls(true);
    setValues((current) => {
      if (current.defaultChatEndpoint === endpoint) return current;
      const baseUrl = current.endpointUrls[current.defaultChatEndpoint] ?? '';
      const endpointUrls = { ...current.endpointUrls };
      for (const type of CHAT_ENDPOINT_TYPES) delete endpointUrls[type];
      endpointUrls[endpoint] = baseUrl;
      return { ...current, defaultChatEndpoint: endpoint, endpointUrls };
    });
  }, []);
  const actions = useMemo<ProviderFormActions>(
    () => ({
      reset,
      replaceTextEndpoint,
      setApiKey,
      setAvatarUri,
      setDefaultChatEndpoint,
      setEndpointUrl,
      setName,
    }),
    [
      reset,
      replaceTextEndpoint,
      setApiKey,
      setAvatarUri,
      setDefaultChatEndpoint,
      setEndpointUrl,
      setName,
    ],
  );

  return useMemo(
    () => ({
      actions,
      meta: {
        provider,
        baseUrlEndpoint: endpointTypes[0] ?? null,
        canSubmit: values.name.trim().length > 0 && !isSubmitting,
        defaultEndpointNeedsRepair: seed.defaultEndpointNeedsRepair,
        hasEditedEndpointUrls,
        isDirty:
          seed.isInitiallyDirty ||
          isProviderFormDirty({ endpointTypes, initialValues: seed.values, values }),
        isSubmitting,
      },
      state: values,
    }),
    [actions, endpointTypes, hasEditedEndpointUrls, isSubmitting, provider, seed, values],
  );
}
