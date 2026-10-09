import { useState } from 'react';

import type { ApiKeyEntry } from '@/shared/data/types/provider';

import {
  createApiKeyEntry,
  getApiKeyValidationError,
  normalizeApiKeyEntries,
} from '../../../apiService/utils/providerApiServiceApiKeys';
import type { ProviderApiKeySheetState } from '../components/ProviderApiKeySheet';
import type { ProviderConfigurationActions } from '../types';

/**
 * The key sheet edits a copy. Adding or saving writes once when the user confirms, so a
 * saved provider never persists a half-typed key or a label on every keystroke.
 */
export function useProviderApiKeySheet(
  apiKeys: readonly ApiKeyEntry[],
  actions: Pick<ProviderConfigurationActions, 'addApiKey' | 'removeApiKey' | 'updateApiKey'>,
) {
  const [state, setState] = useState<ProviderApiKeySheetState | null>(null);
  const others = state ? apiKeys.filter((entry) => entry.id !== state.draft.id) : apiKeys;
  const error = state ? getApiKeyValidationError(state.draft, [...others, state.draft]) : undefined;

  function startAdd() {
    setState({ draft: createApiKeyEntry(), isKeyTouched: false, isNew: true, open: true });
  }

  function startEdit(entry: ApiKeyEntry) {
    setState({ draft: entry, isKeyTouched: true, isNew: false, open: true });
  }

  function change(updates: Partial<Pick<ApiKeyEntry, 'key' | 'label'>>) {
    setState(
      (current) =>
        current && {
          ...current,
          draft: { ...current.draft, ...updates },
          isKeyTouched: current.isKeyTouched || updates.key !== undefined,
        },
    );
  }

  // Keep the last draft while the sheet animates closed.
  function close() {
    setState((current) => current && { ...current, open: false });
  }

  function submit() {
    if (!state?.open || error) return;
    const [entry] = normalizeApiKeyEntries([state.draft]);
    if (state.isNew) void actions.addApiKey(entry);
    else void actions.updateApiKey(entry.id, { key: entry.key, label: entry.label });
    close();
  }

  function remove() {
    if (!state?.open || state.isNew) return;
    void actions.removeApiKey(state.draft.id);
    close();
  }

  return { change, close, error, remove, startAdd, startEdit, state, submit };
}
