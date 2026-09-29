import { useState } from 'react';

import type { ApiKeyEntry } from '@/shared/data/types/provider';

import {
  createApiKeyEntry,
  getApiKeyValidationError,
  normalizeApiKeyEntries,
} from '../../../apiService/utils/providerApiServiceApiKeys';
import type { ProviderFormActions } from '../context';

type ApiKeyEditor = {
  draft: ApiKeyEntry;
  isNew: boolean;
  isKeyTouched: boolean;
  open: boolean;
};

/** Existing keys edit the page draft directly; new keys stay local until added. */
export function useProviderApiKeyEditor(
  apiKeys: readonly ApiKeyEntry[],
  actions: Pick<ProviderFormActions, 'addApiKey' | 'updateApiKey' | 'removeApiKey'>,
) {
  const [state, setEditor] = useState<ApiKeyEditor | null>(null);
  // Read the page's entry while editing; retain a snapshot for the closing animation.
  const entry =
    state?.open && !state.isNew ? apiKeys.find((entry) => entry.id === state.draft.id) : undefined;
  const editor = state && entry ? { ...state, draft: entry } : state;
  const error = editor ? getApiKeyValidationError(editor.draft, apiKeys) : undefined;

  function startAdd() {
    setEditor({ draft: createApiKeyEntry(), isNew: true, isKeyTouched: false, open: true });
  }

  function startEdit(entry: ApiKeyEntry) {
    setEditor({ draft: entry, isNew: false, isKeyTouched: true, open: true });
  }

  function change(updates: Partial<Pick<ApiKeyEntry, 'key' | 'label'>>) {
    if (!editor?.open) return;
    if (!editor.isNew) {
      actions.updateApiKey(editor.draft.id, updates);
      return;
    }
    setEditor(
      (current) =>
        current && {
          ...current,
          draft: { ...current.draft, ...updates },
          isKeyTouched: current.isKeyTouched || updates.key !== undefined,
        },
    );
  }

  function close() {
    if (editor) setEditor({ ...editor, open: false });
  }

  function add() {
    if (!editor?.open || !editor.isNew || error) return;
    const [entry] = normalizeApiKeyEntries([editor.draft]);
    actions.addApiKey(entry);
    close();
  }

  function remove() {
    if (!editor?.open || editor.isNew) return;
    actions.removeApiKey(editor.draft.id);
    close();
  }

  return { editor, error, startAdd, startEdit, change, close, add, remove };
}
