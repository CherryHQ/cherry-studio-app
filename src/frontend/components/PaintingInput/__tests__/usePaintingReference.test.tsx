import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { type PaintingReferenceImage, usePaintingReference } from '../usePaintingReference';

const image = (id: string): PaintingReferenceImage => ({
  fileEntryId: id,
  mediaType: 'image/png',
  name: `${id}.png`,
});

describe('usePaintingReference', () => {
  let renderer: ReactTestRenderer;
  let reference: ReturnType<typeof usePaintingReference>;
  function Probe({ images }: { images: PaintingReferenceImage[] }) {
    reference = usePaintingReference(images);
    return null;
  }
  const update = (images: PaintingReferenceImage[], key = 'session-1') => {
    act(() => renderer.update(<Probe images={images} key={key} />));
  };

  beforeEach(() => {
    act(() => {
      renderer = create(<Probe images={[]} key="session-1" />);
    });
  });
  afterEach(() => act(() => renderer.unmount()));

  it('advances to a new single result but never reattaches a removed result on refresh', () => {
    update([image('first')]);
    expect(reference.selected?.fileEntryId).toBe('first');
    act(() => reference.clear());
    update([image('first')]);
    expect(reference.selected).toBeUndefined();
    expect(reference.needsSelection).toBe(false);
    update([image('second')]);
    expect(reference.selected?.fileEntryId).toBe('second');
  });

  it('requires an explicit choice for multiple results and preserves it on refresh', () => {
    update([image('first'), image('second')]);
    expect(reference.selected).toBeUndefined();
    expect(reference.needsSelection).toBe(true);
    act(() => reference.select('second'));
    update([image('first'), image('second')]);
    expect(reference.selected?.fileEntryId).toBe('second');
    expect(reference.needsSelection).toBe(false);
    act(() => reference.choose());
    expect(reference.needsSelection).toBe(true);
    act(() => reference.select('first'));
    expect(reference.selected?.fileEntryId).toBe('first');
    act(() => reference.clear());
    update([image('first'), image('second')]);
    expect(reference.selected).toBeUndefined();
    expect(reference.needsSelection).toBe(false);
  });

  it('does not carry a reference or its dismissal into another composer session', () => {
    update([image('first')]);
    act(() => reference.clear());
    update([], 'session-2');
    expect(reference.selected).toBeUndefined();
    update([image('first')], 'session-2');
    expect(reference.selected?.fileEntryId).toBe('first');
  });
});
