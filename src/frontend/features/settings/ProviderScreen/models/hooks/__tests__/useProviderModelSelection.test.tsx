import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { UniqueModelId } from '@/shared/data/types/model';

import { useProviderModelSelection } from '../useProviderModelSelection';

type Selection = ReturnType<typeof useProviderModelSelection>;

const first = 'provider-1::alpha' as UniqueModelId;
const second = 'provider-1::beta' as UniqueModelId;

describe('useProviderModelSelection', () => {
  let renderer: ReactTestRenderer | undefined;
  let selection: Selection;

  function Probe() {
    selection = useProviderModelSelection();
    return null;
  }

  beforeEach(() => {
    act(() => {
      renderer = create(<Probe />);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('starts outside a selection', () => {
    expect(selection.isEditing).toBe(false);
    expect(selection.selectedIds.size).toBe(0);
  });

  it('ticks and unticks one model', () => {
    act(() => selection.toggleModel(first));
    expect([...selection.selectedIds]).toEqual([first]);

    act(() => selection.toggleModel(first));
    expect(selection.selectedIds.size).toBe(0);
  });

  it('selects everything, then clears when everything is already selected', () => {
    act(() => selection.toggleAll([first, second]));
    expect([...selection.selectedIds]).toEqual([first, second]);

    act(() => selection.toggleAll([first, second]));
    expect(selection.selectedIds.size).toBe(0);
  });

  // A partial selection means "select all" still has work to do.
  it('completes a partial selection rather than clearing it', () => {
    act(() => selection.toggleModel(first));
    act(() => selection.toggleAll([first, second]));

    expect([...selection.selectedIds]).toEqual([first, second]);
  });

  it('selects nothing when there is nothing selectable', () => {
    act(() => selection.toggleAll([]));

    expect(selection.selectedIds.size).toBe(0);
  });

  // Leaving a selection behind would be invisible until the next edit.
  it('drops the selection on the way out', () => {
    act(() => selection.enterEditing());
    act(() => selection.toggleModel(first));
    expect(selection.isEditing).toBe(true);

    act(() => selection.exitEditing());

    expect(selection.isEditing).toBe(false);
    expect(selection.selectedIds.size).toBe(0);
  });
});
