import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ApiKeyEntry } from '@/shared/data/types/provider';

import { useProviderApiKeyEditor } from '../hooks/useProviderApiKeyEditor';
import { useProviderFormDraft } from '../hooks/useProviderFormDraft';
import { createEmptyProviderFormValues } from '../utils/providerFormValues';

const SAVED_KEYS: ApiKeyEntry[] = [
  { id: 'a', key: 'sk-primary', label: 'Work', isEnabled: true },
  { id: 'b', key: 'sk-backup', label: 'Backup', isEnabled: false },
];

describe('provider API key sheet draft', () => {
  let renderer: ReactTestRenderer;
  let form: ReturnType<typeof useProviderFormDraft>;
  let editor: ReturnType<typeof useProviderApiKeyEditor>;

  function Probe() {
    form = useProviderFormDraft({
      createInitialValues: () => ({
        ...createEmptyProviderFormValues(),
        name: 'Provider',
        apiKeys: SAVED_KEYS,
      }),
      endpointTypes: [],
      isSubmitting: false,
      sourceKey: 'provider',
    });
    editor = useProviderApiKeyEditor(form.state.apiKeys, form.actions);
    return null;
  }

  beforeEach(() => {
    act(() => {
      renderer = create(<Probe />);
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
  });

  it('cancels a new key without adding an empty row or dirtying the page', () => {
    act(() => editor.startAdd());
    act(() => editor.change({ key: 'sk-new', label: 'Personal' }));
    act(() => editor.close());
    expect(form.state.apiKeys).toEqual(SAVED_KEYS);
    expect(form.meta.isDirty).toBe(false);
  });

  it('keeps edits in the page draft when the sheet closes and reopens', () => {
    act(() => editor.startEdit(form.state.apiKeys[0]));
    act(() => editor.change({ key: 'sk-unsaved', label: 'Unsaved' }));
    act(() => editor.close());
    expect(form.state.apiKeys[0]).toEqual({
      ...SAVED_KEYS[0],
      key: 'sk-unsaved',
      label: 'Unsaved',
    });
    expect(form.meta.isDirty).toBe(true);
    act(() => editor.startEdit(form.state.apiKeys[0]));
    expect(editor.editor?.draft).toEqual(form.state.apiKeys[0]);
    act(() => form.actions.reset());
    expect(form.meta.isDirty).toBe(false);
    expect(editor.editor?.draft).toEqual(SAVED_KEYS[0]);
  });

  it('updates only the selected key immediately and retains its enabled state', () => {
    act(() => editor.startEdit(form.state.apiKeys[1]));
    act(() => editor.change({ key: ' sk-updated ', label: ' Personal ' }));
    expect(form.state.apiKeys).toEqual([
      SAVED_KEYS[0],
      { id: 'b', key: ' sk-updated ', label: ' Personal ', isEnabled: false },
    ]);
    expect(form.meta.isDirty).toBe(true);
    expect(editor.editor?.open).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['sk-backup', 'duplicate'],
    ['sk-first,sk-second', 'invalidFormat'],
  ])('retains invalid input %j and blocks page save until corrected', (key, error) => {
    act(() => editor.startEdit(form.state.apiKeys[0]));
    act(() => editor.change({ key }));
    expect(editor.error).toBe(error);
    act(() => editor.close());
    expect(form.state.apiKeys[0].key).toBe(key);
    expect(form.meta.canSubmit).toBe(false);
    act(() => editor.startEdit(form.state.apiKeys[0]));
    expect(editor.error).toBe(error);
    act(() => editor.change({ key: 'sk-corrected' }));
    expect(editor.error).toBeUndefined();
    expect(form.meta.canSubmit).toBe(true);
  });

  it('adds a valid new key once and rejects empty or duplicate drafts', () => {
    act(() => editor.startAdd());
    act(() => editor.add());
    expect(form.state.apiKeys).toHaveLength(2);
    expect(editor.error).toBe('empty');
    act(() => editor.change({ key: ' sk-backup ' }));
    act(() => editor.add());
    expect(form.state.apiKeys).toHaveLength(2);
    expect(editor.error).toBe('duplicate');
    act(() => editor.change({ key: 'sk-new', label: 'Personal' }));
    act(() => {
      editor.add();
      editor.add();
    });
    expect(form.state.apiKeys).toHaveLength(3);
    expect(form.state.apiKeys[2]).toMatchObject({
      key: 'sk-new',
      label: 'Personal',
      isEnabled: true,
    });
    expect(SAVED_KEYS.map((entry) => entry.id)).not.toContain(form.state.apiKeys[2].id);
  });

  it('removes an invalid key from the draft and restores page save', () => {
    act(() => editor.startEdit(form.state.apiKeys[0]));
    act(() => editor.change({ key: '' }));
    act(() => editor.remove());
    expect(form.state.apiKeys).toEqual([SAVED_KEYS[1]]);
    expect(form.meta.isDirty).toBe(true);
    expect(form.meta.canSubmit).toBe(true);
    expect(editor.editor?.open).toBe(false);
  });
});
