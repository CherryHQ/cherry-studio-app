import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ComposerAttachmentDraft } from '@/frontend/components/Composer/utils/composerAttachments';
import type { ResolvedFileEntry } from '@/frontend/hooks/file';
import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

import { FilePickerBottomSheet } from '../FilePickerBottomSheet';

let mockAttachments: ComposerAttachmentDraft[] = [];
let mockEntries: ResolvedFileEntry[] = [];
const mockAddAttachments = jest.fn();
const mockRequestCreate = jest.fn();

jest.mock('@cherrystudio/app-icons/icons/upload', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/chevron-down', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/chevron-right', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/folder', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/folder-open', () => () => null);

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  return {
    BottomSheet: ({
      children,
      footer,
      open,
      ...props
    }: {
      children: ReactNode;
      footer?: ReactNode;
      open: boolean;
    }) =>
      React.createElement(
        'Sheet',
        { ...props, footer, open },
        open ? children : null,
        open ? footer : null,
      ),
    Button: ({ children, ...props }: { children: ReactNode }) =>
      React.createElement('Button', props, children),
    ContentState: {
      Empty: () => null,
      Error: () => null,
      Loading: () => null,
    },
    SelectionIndicator: (props: object) => React.createElement('SelectionIndicator', props),
  };
});

jest.mock('@legendapp/list/react-native', () => {
  const React = jest.requireActual('react');
  return {
    LegendList: ({
      data,
      extraData,
      keyExtractor,
      renderItem,
    }: {
      data: readonly unknown[];
      extraData: unknown;
      keyExtractor?: (item: unknown) => string;
      renderItem: (info: { item: unknown; index: number; extraData: unknown }) => ReactNode;
    }) =>
      React.createElement(
        'LegendList',
        null,
        data.map((item, index) =>
          React.createElement(
            React.Fragment,
            { key: keyExtractor ? keyExtractor(item) : index },
            renderItem({ item, index, extraData }),
          ),
        ),
      ),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US', resolvedLanguage: 'en-US' },
    t: (key: string, params?: { count?: number }) =>
      params?.count !== undefined ? `${key}:${params.count}` : key,
  }),
}));

jest.mock('@/frontend/components/Composer', () => ({
  useComposerActions: () => ({ addAttachments: mockAddAttachments }),
  useComposerState: () => ({ attachments: mockAttachments }),
}));

jest.mock('@/frontend/components/FileFolderPicker', () => ({
  useCreateFileFolder: () => ({ isCreating: false, requestCreate: mockRequestCreate }),
}));

jest.mock('@/frontend/components/FileEntryPreview', () => ({
  FileEntrySkeleton: () => null,
  LoadedFileEntryPreview: () => null,
}));

jest.mock('@/frontend/data', () => ({
  useQuery: () => ({ data: [], error: null, isLoading: false, refetch: jest.fn() }),
}));

jest.mock('@/frontend/hooks/file', () => ({
  useFileEntryPages: () => ({
    entries: mockEntries,
    error: null,
    hasNext: false,
    isLoading: false,
    isLoadingMore: false,
    loadNext: jest.fn(),
    refresh: jest.fn(),
  }),
}));

function makeEntry(id: string, filename = `${id}.txt`): ResolvedFileEntry {
  return {
    entry: {
      createdAt: 1000,
      filename,
      id: id as FileEntryId,
      mediaType: 'text/plain',
      provenance: 'imported',
      size: 128,
      updatedAt: 2000,
    } as FileEntry,
    previewUri: undefined,
    uri: `file:///${filename}`,
  };
}

function makeReadyAttachment(id: string): ComposerAttachmentDraft {
  return {
    fileEntryId: id as FileEntryId,
    id: `att-${id}`,
    kind: 'file',
    mediaType: 'text/plain',
    name: `${id}.txt`,
    status: 'ready',
    uri: `file:///${id}.txt`,
  };
}

let renderer: ReactTestRenderer;
const onClose = jest.fn();
const onSelect = jest.fn();
const onUpload = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockAttachments = [];
  mockEntries = [makeEntry('f1'), makeEntry('f2'), makeEntry('f3')];
});

afterEach(() => act(() => renderer.unmount()));

function mount(props: Partial<Parameters<typeof FilePickerBottomSheet>[0]> = {}) {
  act(() => {
    renderer = create(
      <FilePickerBottomSheet
        onClose={onClose}
        onSelect={onSelect}
        onUpload={onUpload}
        open
        {...props}
      />,
    );
  });
}

test('keeps New folder in the footer by default and appends Add when files are selected', () => {
  mount();

  expect(renderer.root.findByProps({ testID: 'file-picker-create-folder' })).toBeTruthy();
  expect(renderer.root.findAllByProps({ testID: 'file-picker-add' })).toHaveLength(0);

  act(() => renderer.root.findByProps({ testID: 'file-picker-entry-f1' }).props.onPress());

  expect(renderer.root.findByProps({ testID: 'file-picker-create-folder' })).toBeTruthy();
  expect(renderer.root.findByProps({ testID: 'file-picker-add' }).props.children).toBe(
    'chat.filePicker.addSelected:1',
  );
});

test('omits the footer when allowCreateFolder is false until files are selected', () => {
  mount({ allowCreateFolder: false });

  const sheet = renderer.root.findByProps({ testID: 'file-picker' });
  expect(sheet.props.footer).toBeUndefined();
  expect(renderer.root.findAllByProps({ testID: 'file-picker-create-folder' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'file-picker-add' })).toHaveLength(0);

  act(() => renderer.root.findByProps({ testID: 'file-picker-entry-f1' }).props.onPress());

  expect(renderer.root.findByProps({ testID: 'file-picker' }).props.footer).toBeDefined();
  expect(renderer.root.findAllByProps({ testID: 'file-picker-create-folder' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'file-picker-add' }).props.children).toBe(
    'chat.filePicker.addSelected:1',
  );
});

test('enforces remaining maxAttachments slots, allows deselecting, and submits selected files', () => {
  mockAttachments = [
    makeReadyAttachment('e1'),
    makeReadyAttachment('e2'),
    makeReadyAttachment('e3'),
    makeReadyAttachment('e4'),
    makeReadyAttachment('e5'),
    makeReadyAttachment('e6'),
  ];
  mockEntries = [makeEntry('e1'), makeEntry('f1'), makeEntry('f2'), makeEntry('f3')];

  mount({ allowCreateFolder: false, maxAttachments: 8 });

  expect(renderer.root.findByProps({ testID: 'file-picker-upload' }).props.disabled).toBe(false);

  act(() => renderer.root.findByProps({ testID: 'file-picker-entry-f1' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'file-picker-entry-f2' }).props.onPress());

  const f1Row = renderer.root.findByProps({ testID: 'file-picker-entry-f1' });
  const f3Row = renderer.root.findByProps({ testID: 'file-picker-entry-f3' });
  expect(f1Row.props.disabled).toBe(false);
  expect(f1Row.props.accessibilityState).toEqual({ checked: true, disabled: false });
  expect(f3Row.props.disabled).toBe(true);
  expect(f3Row.props.accessibilityState).toEqual({ checked: false, disabled: true });

  // Reaching the limit prevents adding another file.
  act(() => f3Row.props.onPress());
  expect(renderer.root.findByProps({ testID: 'file-picker-add' }).props.children).toBe(
    'chat.filePicker.addSelected:2',
  );

  // Toggling off a selected item frees a slot for another file.
  act(() => renderer.root.findByProps({ testID: 'file-picker-entry-f1' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'file-picker-entry-f3' }).props.disabled).toBe(false);

  act(() => renderer.root.findByProps({ testID: 'file-picker-entry-f3' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'file-picker-add' }).props.onPress());

  expect(mockAddAttachments).toHaveBeenCalledTimes(1);
  expect(
    mockAddAttachments.mock.calls[0][0].map(
      (item: { fileEntryId: FileEntryId }) => item.fileEntryId,
    ),
  ).toEqual(['f2', 'f3']);
  expect(onSelect).toHaveBeenCalledTimes(1);
});

test('disables upload and additional selection when maxAttachments has zero remaining slots', () => {
  mockAttachments = [
    makeReadyAttachment('e1'),
    makeReadyAttachment('e2'),
    makeReadyAttachment('e3'),
    makeReadyAttachment('e4'),
    makeReadyAttachment('e5'),
    makeReadyAttachment('e6'),
    makeReadyAttachment('e7'),
    makeReadyAttachment('e8'),
  ];

  mount({ allowCreateFolder: false, maxAttachments: 8 });

  const upload = renderer.root.findByProps({ testID: 'file-picker-upload' });
  expect(upload.props.disabled).toBe(true);
  expect(upload.props.accessibilityState).toEqual({ disabled: true });

  const f1Row = renderer.root.findByProps({ testID: 'file-picker-entry-f1' });
  expect(f1Row.props.disabled).toBe(true);
  act(() => f1Row.props.onPress());
  expect(renderer.root.findAllByProps({ testID: 'file-picker-add' })).toHaveLength(0);
});
