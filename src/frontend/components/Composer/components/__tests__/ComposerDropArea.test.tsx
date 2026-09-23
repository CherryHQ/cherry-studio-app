import { type ReactNode, useEffect } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ImageDropEvent } from '../../../../../../modules/image-drop-target';
import {
  ComposerProvider,
  useComposerActions,
  useComposerState,
} from '../../context/ComposerProvider';
import type { ComposerAttachmentDraft } from '../../utils/composerAttachments';
import { ComposerDropArea } from '../ComposerDropArea';

type MockNativeViewProps = {
  children?: ReactNode;
  enabled?: boolean;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  onDropImages?: (event: NativeSyntheticEvent<ImageDropEvent>) => void;
};

const mockToastShow = jest.fn();
const mockFileDelete = jest.fn();
const mockConstructedUris: string[] = [];
let mockDropTargetProps: MockNativeViewProps | null = null;

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn((uri: string) => {
    mockConstructedUris.push(uri);
    return { exists: true, delete: mockFileDelete };
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}:${JSON.stringify(values)}`,
  }),
}));

jest.mock('expo', () => ({
  // The raw native view stand-in, returned from requireNativeView so the real
  // ImageDropTargetView wrapper stays in the loop: the mock captures the props
  // the wrapper forwards, and events fired on it cross the same React Native
  // synthetic-event boundary the device delivers (see nativeDropEvent).
  requireNativeView: () => {
    const React = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    return function MockNativeImageDropTarget(props: MockNativeViewProps) {
      mockDropTargetProps = props;
      return React.createElement(View, { testID: 'mock-drop-target' }, props.children);
    };
  },
}));

/**
 * Fires the drop handler the way the native side delivers it: React Native
 * wraps every view event body in a synthetic event, so the payload rides
 * `nativeEvent`.
 */
function nativeDropEvent(event: ImageDropEvent): NativeSyntheticEvent<ImageDropEvent> {
  // Only `nativeEvent` is observable to the component; the rest of the
  // envelope is transport metadata the bridge adds on device.
  return { nativeEvent: event } as unknown as NativeSyntheticEvent<ImageDropEvent>;
}

let attachments: readonly ComposerAttachmentDraft[] = [];
const composerActionsRef: { current: ReturnType<typeof useComposerActions> | undefined } = {
  current: undefined,
};

function AttachmentsProbe() {
  const state = useComposerState();

  useEffect(() => {
    attachments = state.attachments;
  }, [state.attachments]);

  return null;
}

function ActionsProbe() {
  composerActionsRef.current = useComposerActions();
  return null;
}

/** An image attachment the composer already holds. */
function heldImage(name: string) {
  return {
    id: `photo:held-${name}`,
    kind: 'image' as const,
    mediaType: 'image/jpeg',
    name,
    uri: `file:///tmp/${name}`,
  };
}

function dropImage(name: string, id = name) {
  return {
    height: 800,
    id: `drop-${id}`,
    mediaType: 'image/jpeg',
    name,
    size: 1024,
    uri: `file:///cache/ImageDropTarget/${name}`,
    width: 600,
  };
}

let renderer: ReactTestRenderer | undefined;

async function renderDropArea(props: { enabled?: boolean } = {}) {
  await act(async () => {
    renderer = create(
      <ComposerProvider>
        <ComposerDropArea {...props}>
          <AttachmentsProbe />
          <ActionsProbe />
        </ComposerDropArea>
      </ComposerProvider>,
    );
  });
}

describe('ComposerDropArea', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConstructedUris.length = 0;
    mockDropTargetProps = null;
    attachments = [];
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('stages dropped images through the composer attachment pipeline', async () => {
    await renderDropArea();

    await act(async () =>
      mockDropTargetProps?.onDropImages?.(
        nativeDropEvent({
          failedCount: 0,
          images: [dropImage('first.jpg'), dropImage('second.jpg')],
          totalDropped: 2,
        }),
      ),
    );

    expect(attachments).toHaveLength(2);
    // A source draft without status: staging to 'importing' is the managed
    // attachment store's job, covered by its own suite.
    expect(attachments[0]).toEqual({
      id: 'photo:drop-first.jpg',
      kind: 'image',
      mediaType: 'image/jpeg',
      name: 'first.jpg',
      size: 1024,
      uri: 'file:///cache/ImageDropTarget/first.jpg',
    });
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  it('keeps two drops of one path separate through the per-item payload id', async () => {
    await renderDropArea();

    // The same staged path comes back once an earlier copy was cleaned up;
    // the attachment identity rides the unique payload id, not the URI.
    const first = dropImage('photo.jpg', 'a');
    const second = { ...dropImage('photo.jpg', 'b'), uri: first.uri };

    await act(async () =>
      mockDropTargetProps?.onDropImages?.(
        nativeDropEvent({
          failedCount: 0,
          images: [first],
          totalDropped: 1,
        }),
      ),
    );
    await act(async () =>
      mockDropTargetProps?.onDropImages?.(
        nativeDropEvent({
          failedCount: 0,
          images: [second],
          totalDropped: 1,
        }),
      ),
    );

    expect(attachments).toHaveLength(2);
    expect(attachments.map(({ id }) => id)).toEqual(['photo:drop-a', 'photo:drop-b']);
  });

  it('ignores payloads that are not images', async () => {
    await renderDropArea();

    await act(async () =>
      mockDropTargetProps?.onDropImages?.(
        nativeDropEvent({
          failedCount: 0,
          images: [
            {
              id: 'drop-pdf',
              mediaType: 'application/pdf',
              name: 'brief.pdf',
              size: 10,
              uri: 'file:///cache/brief.pdf',
            },
            { id: 'drop-txt', mediaType: 'text/plain', name: 'note.txt', uri: 'x' },
          ],
          totalDropped: 2,
        }),
      ),
    );

    expect(attachments).toEqual([]);
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  it('caps a batch at the photo selection limit and says so', async () => {
    await renderDropArea();

    await act(async () =>
      mockDropTargetProps?.onDropImages?.(
        nativeDropEvent({
          failedCount: 0,
          images: Array.from({ length: 11 }, (_, index) => dropImage(`photo-${index}.jpg`)),
          totalDropped: 11,
        }),
      ),
    );

    expect(attachments).toHaveLength(9);
    expect(attachments.map(({ name }) => name)).not.toContain('photo-9.jpg');
    expect(mockToastShow).toHaveBeenCalledWith({
      label: expect.stringContaining('chat.attachments.dropLimit'),
      variant: 'warning',
    });
    expect(mockToastShow).toHaveBeenCalledWith({
      label: expect.stringContaining('"added":9'),
      variant: 'warning',
    });
    expect(mockToastShow).toHaveBeenCalledWith({
      label: expect.stringContaining('"total":11'),
      variant: 'warning',
    });
  });

  it('counts natively truncated items in the overflow feedback', async () => {
    await renderDropArea();

    // The real native event: an 11-image drop delivers at most 9 payloads.
    await act(async () =>
      mockDropTargetProps?.onDropImages?.(
        nativeDropEvent({
          failedCount: 0,
          images: Array.from({ length: 9 }, (_, index) => dropImage(`kept-${index}.jpg`)),
          totalDropped: 11,
        }),
      ),
    );

    // All nine delivered images fit the composer, yet two were discarded
    // before delivery — the drop total must still reach the feedback.
    expect(attachments).toHaveLength(9);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: expect.stringContaining('"added":9'),
      variant: 'warning',
    });
    expect(mockToastShow).toHaveBeenCalledWith({
      label: expect.stringContaining('"total":11'),
      variant: 'warning',
    });
  });

  it('shows the accept highlight while the drag hovers and clears it on drop', async () => {
    await renderDropArea();

    await act(async () => mockDropTargetProps?.onDragEnter?.());
    expect(renderer?.root.findByProps({ testID: 'composer-drop-area-highlight' })).toBeTruthy();

    await act(async () => mockDropTargetProps?.onDragLeave?.());
    expect(renderer?.root.findAllByProps({ testID: 'composer-drop-area-highlight' })).toHaveLength(
      0,
    );

    await act(async () => mockDropTargetProps?.onDragEnter?.());
    await act(async () =>
      mockDropTargetProps?.onDropImages?.(
        nativeDropEvent({
          failedCount: 0,
          images: [dropImage('first.jpg')],
          totalDropped: 1,
        }),
      ),
    );
    expect(renderer?.root.findAllByProps({ testID: 'composer-drop-area-highlight' })).toHaveLength(
      0,
    );
  });

  it('accepts only the remaining per-message quota and says what was skipped', async () => {
    await renderDropArea();
    // The composer already holds eight images: one slot is left.
    const held = Array.from({ length: 8 }, (_, index) => heldImage(`held-${index}.jpg`));
    act(() => composerActionsRef.current?.addAttachments(held));
    expect(attachments).toHaveLength(8);

    await act(async () =>
      mockDropTargetProps?.onDropImages?.(
        nativeDropEvent({
          failedCount: 0,
          images: [dropImage('a.jpg'), dropImage('b.jpg')],
          totalDropped: 2,
        }),
      ),
    );

    expect(attachments).toHaveLength(9);
    expect(attachments.map(({ name }) => name)).toContain('a.jpg');
    expect(attachments.map(({ name }) => name)).not.toContain('b.jpg');
    expect(mockToastShow).toHaveBeenCalledWith({
      label: expect.stringContaining('chat.attachments.dropLimit'),
      variant: 'warning',
    });
    expect(mockToastShow).toHaveBeenCalledWith({
      label: expect.stringContaining('"added":1'),
      variant: 'warning',
    });
    expect(mockToastShow).toHaveBeenCalledWith({
      label: expect.stringContaining('"total":2'),
      variant: 'warning',
    });
    // The rejected overflow copy is a staged file nobody owns anymore.
    expect(mockConstructedUris).toContain('file:///cache/ImageDropTarget/b.jpg');
    expect(mockFileDelete).toHaveBeenCalled();
  });

  it('reports native staging failures to the user', async () => {
    await renderDropArea();

    // The real native event: five items dropped, two failed staging, three
    // delivered. All three delivered images fit the composer, so the quota
    // was never approached and the limit toast must stay silent.
    await act(async () =>
      mockDropTargetProps?.onDropImages?.(
        nativeDropEvent({
          failedCount: 2,
          images: [
            dropImage('survivor-0.jpg'),
            dropImage('survivor-1.jpg'),
            dropImage('survivor-2.jpg'),
          ],
          totalDropped: 5,
        }),
      ),
    );

    expect(attachments).toHaveLength(3);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: expect.stringContaining('chat.attachments.dropFailed'),
      variant: 'warning',
    });
    expect(mockToastShow).not.toHaveBeenCalledWith({
      label: expect.stringContaining('chat.attachments.dropLimit'),
      variant: 'warning',
    });
  });

  it('passes the enabled gate through to the native view', async () => {
    await renderDropArea({ enabled: false });
    expect(mockDropTargetProps?.enabled).toBe(false);

    await renderDropArea({ enabled: true });
    expect(mockDropTargetProps?.enabled).toBe(true);
  });
});
