import { type ComponentType, type ReactNode, useEffect } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ImageDropEvent } from '../../../../../../modules/image-drop-target';
import {
  ComposerProvider,
  useComposerActions,
  useComposerState,
} from '../../context/ComposerProvider';
import type { ComposerAttachmentDraft } from '../../utils/composerAttachments';
import { ComposerDropArea } from '../ComposerDropArea';

const mockToastShow = jest.fn();
let mockDropTargetProps: {
  enabled?: boolean;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  onDropImages?: (event: ImageDropEvent) => void;
} | null = null;
const mockViewRef: {
  current: ComponentType<{
    children?: ReactNode;
    enabled?: boolean;
    onDragEnter?: () => void;
    onDragLeave?: () => void;
    onDropImages?: (event: ImageDropEvent) => void;
  }> | null;
} = { current: createMockViewComponent() };

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}:${JSON.stringify(values)}`,
  }),
}));

jest.mock('../../../../../../modules/image-drop-target', () => ({
  // A getter, so the component re-reads the current stand-in on every render
  // and its real "unavailable" branch sees null.
  get ImageDropTargetView() {
    return mockViewRef.current;
  },
}));

function createMockViewComponent() {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return function MockImageDropTargetView(props: {
    children?: ReactNode;
    enabled?: boolean;
    onDragEnter?: () => void;
    onDragLeave?: () => void;
    onDropImages?: (event: ImageDropEvent) => void;
  }) {
    mockDropTargetProps = props;
    return React.createElement(View, { testID: 'mock-drop-target' }, props.children);
  };
}

let attachments: readonly ComposerAttachmentDraft[] = [];
let composerActions: ReturnType<typeof useComposerActions> | undefined;

function AttachmentsProbe() {
  const state = useComposerState();

  useEffect(() => {
    attachments = state.attachments;
  }, [state.attachments]);

  return null;
}

function ActionsProbe() {
  composerActions = useComposerActions();
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

function dropImage(name: string) {
  return {
    height: 800,
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
    mockDropTargetProps = null;
    mockViewRef.current = createMockViewComponent();
    attachments = [];
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('stages dropped images through the composer attachment pipeline', async () => {
    await renderDropArea();

    await act(async () =>
      mockDropTargetProps?.onDropImages?.({
        failedCount: 0,
        images: [dropImage('first.jpg'), dropImage('second.jpg')],
        totalDropped: 2,
      }),
    );

    expect(attachments).toHaveLength(2);
    // A source draft without status: staging to 'importing' is the managed
    // attachment store's job, covered by its own suite.
    expect(attachments[0]).toEqual({
      id: 'photo:file:///cache/ImageDropTarget/first.jpg',
      kind: 'image',
      mediaType: 'image/jpeg',
      name: 'first.jpg',
      size: 1024,
      uri: 'file:///cache/ImageDropTarget/first.jpg',
    });
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  it('ignores payloads that are not images', async () => {
    await renderDropArea();

    await act(async () =>
      mockDropTargetProps?.onDropImages?.({
        failedCount: 0,
        images: [
          {
            mediaType: 'application/pdf',
            name: 'brief.pdf',
            size: 10,
            uri: 'file:///cache/brief.pdf',
          },
          { mediaType: 'text/plain', name: 'note.txt', uri: 'x' },
        ],
        totalDropped: 2,
      }),
    );

    expect(attachments).toEqual([]);
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  it('caps a batch at the photo selection limit and says so', async () => {
    await renderDropArea();

    await act(async () =>
      mockDropTargetProps?.onDropImages?.({
        failedCount: 0,
        images: Array.from({ length: 11 }, (_, index) => dropImage(`photo-${index}.jpg`)),
        totalDropped: 11,
      }),
    );

    expect(attachments).toHaveLength(9);
    expect(attachments.map(({ name }) => name)).not.toContain('photo-9.jpg');
    expect(mockToastShow).toHaveBeenCalledWith({
      label: expect.stringContaining('chat.attachments.dropLimit'),
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
      mockDropTargetProps?.onDropImages?.({
        failedCount: 0,
        images: [dropImage('first.jpg')],
        totalDropped: 1,
      }),
    );
    expect(renderer?.root.findAllByProps({ testID: 'composer-drop-area-highlight' })).toHaveLength(
      0,
    );
  });

  it('accepts only the remaining per-message quota and says what was skipped', async () => {
    await renderDropArea();
    // The composer already holds eight images: one slot is left.
    const held = Array.from({ length: 8 }, (_, index) => heldImage(`held-${index}.jpg`));
    act(() => composerActions?.addAttachments(held));
    expect(attachments).toHaveLength(8);

    await act(async () =>
      mockDropTargetProps?.onDropImages?.({
        failedCount: 0,
        images: [dropImage('a.jpg'), dropImage('b.jpg')],
        totalDropped: 2,
      }),
    );

    expect(attachments).toHaveLength(9);
    expect(attachments.map(({ name }) => name)).toContain('a.jpg');
    expect(attachments.map(({ name }) => name)).not.toContain('b.jpg');
    expect(mockToastShow).toHaveBeenCalledWith({
      label: expect.stringContaining('chat.attachments.dropLimit'),
      variant: 'warning',
    });
  });

  it('reports native staging failures to the user', async () => {
    await renderDropArea();

    await act(async () =>
      mockDropTargetProps?.onDropImages?.({
        failedCount: 2,
        images: [dropImage('survivor.jpg')],
        totalDropped: 5,
      }),
    );

    expect(attachments).toHaveLength(1);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: expect.stringContaining('chat.attachments.dropFailed'),
      variant: 'warning',
    });
  });

  it('passes the enabled gate through to the native view', async () => {
    await renderDropArea({ enabled: false });
    expect(mockDropTargetProps?.enabled).toBe(false);

    await renderDropArea({ enabled: true });
    expect(mockDropTargetProps?.enabled).toBe(true);
  });

  it('renders a plain container when the native view is unavailable', async () => {
    mockViewRef.current = null;
    try {
      await renderDropArea();
      expect(renderer?.root.findAllByProps({ testID: 'mock-drop-target' })).toHaveLength(0);
      expect(renderer?.root.findByType(View)).toBeTruthy();
    } finally {
      mockViewRef.current = createMockViewComponent();
    }
  });
});
