import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import LanguagesIcon from '@cherrystudio/app-icons/icons/languages';
import { Sortable } from '@cherrystudio/ui/components';
import { Children, isValidElement, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  DEFAULT_ASSISTANT_MESSAGE_TOOLBAR_CONFIG as defaults,
  normalizeAssistantMessageToolbarConfig,
  type AssistantMessageToolbarConfig,
} from '@/shared/data/types/assistantMessageToolbar';

import { AssistantToolbarManageSheet } from '../AssistantToolbarManageSheet';

let mockI18n: { resolvedLanguage?: string; language: string } | undefined;
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: mockI18n,
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key,
  }),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const host =
    (type: string) =>
    ({ children, ...props }: { children?: ReactNode }) =>
      createElement(type, props, children);
  return {
    BottomSheet: host('BottomSheet'),
    Button: host('Button'),
    Section: Object.assign(host('Section'), {
      Item: ({
        label,
        leading,
        description,
        ...props
      }: {
        label: ReactNode;
        leading?: ReactNode;
        description?: ReactNode;
      }) =>
        createElement('SectionItem', { label, description, ...props }, leading, label, description),
    }),
    Sortable: {
      Root: ({ children }: { children: (state: { isDragging: boolean }) => ReactNode }) =>
        children({ isDragging: false }),
      Chrome: host('SortableChrome'),
      Exclusion: host('SortableExclusion'),
      Group: host('SortableGroup'),
      Item: host('SortableItem'),
    },
    ScrollInteractionBoundary: ({ children }: { children: (handlers: object) => ReactNode }) =>
      children({}),
    useSortableScrollController: () => ({ controller: {}, setRef: () => {}, onScroll: () => {} }),
  };
});

describe('AssistantToolbarManageSheet', () => {
  let renderer: ReactTestRenderer;
  const onChange = jest.fn();
  const onClose = jest.fn();
  const onClosed = jest.fn();

  function render(config: AssistantMessageToolbarConfig = defaults) {
    act(() => {
      renderer = create(
        <AssistantToolbarManageSheet
          config={config}
          onChange={onChange}
          onClose={onClose}
          onClosed={onClosed}
          open
        />,
      );
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockI18n = undefined;
  });
  afterEach(() => act(() => renderer?.unmount()));

  test('shows preview icons in pinned order at toolbar scale', () => {
    const config = normalizeAssistantMessageToolbarConfig({
      pinned: ['translate', 'copy'],
      overflow: [],
    });
    render(config);
    const icons = renderer.root.findAll(
      (node) => node.type === 'View' && node.props.testID?.startsWith('toolbar-manage-preview-'),
    );
    expect(icons.map((node) => node.props.testID)).toEqual([
      'toolbar-manage-preview-translate',
      'toolbar-manage-preview-copy',
    ]);
    expect(icons[0].findByType(LanguagesIcon).props).toMatchObject({
      size: 15,
      className: 'text-muted-foreground',
    });
    expect(icons[1].findByType(CopyIcon).props.size).toBe(15);
    expect(icons.every((icon) => icon.props.className === 'p-1.5')).toBe(true);
    const previewRow = renderer.root
      .findAllByType('View')
      .find((view) => view.props.className === 'min-h-7 flex-row items-center gap-1')!;
    expect(previewRow).toBeDefined();
    expect(
      previewRow.findAll((node) => node.type === 'View' && node.props.className === 'p-1.5'),
    ).toHaveLength(3);
  });

  test.each([{ language: 'en-US', resolvedLanguage: 'de-DE' }, { language: 'zh-CN' }])(
    'formats preview seconds with the app locale %p',
    (i18n) => {
      mockI18n = i18n;
      render();
      const duration = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
        style: 'unit',
        unit: 'second',
        maximumFractionDigits: 1,
      }).format(2.1);
      expect(renderer.root.findAllByType('Text').map((text) => text.children.join(''))).toContain(
        `1.2k · ${duration}`,
      );
    },
  );

  test('exposes Sortable.Item directly to Section for row press handling and separators', () => {
    render();
    const rowsBySection = renderer.root
      .findAllByType('Section')
      .map((section) =>
        Children.toArray(section.props.children).flatMap((child) =>
          isValidElement<{ id: string }>(child) && child.type === Sortable.Item
            ? [child.props.id]
            : [],
        ),
      );
    expect(rowsBySection).toEqual([
      defaults.pinned,
      defaults.overflow.filter((id) => id !== 'delete'),
    ]);
  });

  test('uses a large dismissible sheet with no header or footer actions', () => {
    render();
    const sheet = renderer.root.findByType('BottomSheet');
    expect(sheet.props).toMatchObject({
      open: true,
      size: 'large',
      testID: 'assistant-toolbar-manage-sheet',
      title: 'chat.messageActions.manageTitle',
    });
    for (const prop of ['closeAction', 'headerAction', 'footer'])
      expect(sheet.props).not.toHaveProperty(prop);
    act(() => sheet.props.onClose());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClosed).not.toHaveBeenCalled();
    act(() => sheet.props.onClosed());
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  test('unpins and pins immediately on minus/plus without a save step', () => {
    render();
    act(() => renderer.root.findByProps({ testID: 'toolbar-manage-unpin-copy' }).props.onPress());
    const next = onChange.mock.lastCall![0];
    expect(next.pinned).toEqual(['readAloud', 'retry', 'answerWith', 'fork']);
    expect(next.overflow).toEqual(['copy', 'edit', 'translate', 'share', 'delete']);
    act(() =>
      renderer.update(
        <AssistantToolbarManageSheet config={next} onChange={onChange} onClose={onClose} open />,
      ),
    );
    const plus = renderer.root.findByProps({ testID: 'toolbar-manage-pin-share' });
    expect(plus.props.disabled).toBe(false);
    act(() => plus.props.onPress());
    expect(onChange.mock.lastCall![0]).toEqual({
      pinned: ['readAloud', 'retry', 'answerWith', 'fork', 'share'],
      overflow: ['copy', 'edit', 'translate', 'delete'],
    });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  test('disables all plus buttons at five pinned and shows the limit hint', () => {
    render();
    const buttons = renderer.root
      .findAllByType('Button')
      .filter((button) => button.props.testID.startsWith('toolbar-manage-pin-'));
    expect(buttons).toHaveLength(3);
    expect(buttons.every((button) => button.props.disabled)).toBe(true);
    expect(renderer.root.findAllByType('Section').map((section) => section.props.footer)).toContain(
      'chat.messageActions.managePinnedLimitHint:5',
    );
    expect(
      renderer.root
        .findAllByType('SortableItem')
        .filter((item) => item.props.groupId === 'overflow')
        .every((item) => !item.props.menuItems.some((entry: { id: string }) => entry.id === 'pin')),
    ).toBe(true);
  });

  test.each(['pinned', 'overflow'] as const)('persists Sortable %s reorder immediately', (zone) => {
    render();
    const group = renderer.root
      .findAllByType('SortableGroup')
      .find((item) => item.props.groupId === zone)!;
    act(() => group.props.onReorder({ fromIndex: 1, toIndex: 0 }));
    expect(onChange.mock.lastCall![0][zone]).toEqual(
      zone === 'pinned'
        ? ['readAloud', 'copy', 'retry', 'answerWith', 'fork']
        : ['translate', 'edit', 'share', 'delete'],
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('offers move-to-top and pin/unpin contextual alternatives', () => {
    const config = normalizeAssistantMessageToolbarConfig({
      pinned: ['copy', 'edit'],
      overflow: [],
    });
    render(config);
    const edit = renderer.root
      .findAllByType('SortableItem')
      .find((item) => item.props.id === 'edit')!;
    expect(edit.props.accessibilityLabels).toMatchObject({
      moveDown: 'common.moveDown:chat.messageActions.editAnswerAction',
      moveUp: 'common.moveUp:chat.messageActions.editAnswerAction',
    });
    act(() =>
      edit.props.menuItems.find((item: { id: string }) => item.id === 'move-to-top').onPress(),
    );
    expect(onChange.mock.lastCall![0].pinned).toEqual(['edit', 'copy']);
    act(() => edit.props.menuItems.find((item: { id: string }) => item.id === 'unpin').onPress());
    expect(onChange.mock.lastCall![0].overflow[0]).toBe('edit');
    const share = renderer.root
      .findAllByType('SortableItem')
      .find((item) => item.props.id === 'share')!;
    act(() => share.props.menuItems.find((item: { id: string }) => item.id === 'pin').onPress());
    expect(onChange.mock.lastCall![0].pinned).toEqual(['copy', 'edit', 'share']);
  });

  test('keeps delete locked, non-sortable and last in the overflow section', () => {
    render();
    const groups = renderer.root.findAllByType('SortableGroup');
    expect(groups.find((group) => group.props.groupId === 'overflow')!.props.itemIds).toEqual([
      'edit',
      'translate',
      'share',
    ]);
    expect(
      renderer.root.findAllByType('SortableItem').some((item) => item.props.id === 'delete'),
    ).toBe(false);
    // The locked row is the final Section item, outside any Sortable.Item.
    const row = renderer.root.findAllByType('SectionItem').at(-1)!;
    expect(row.props).toMatchObject({
      testID: 'toolbar-manage-locked-delete',
      destructive: true,
      label: 'common.delete',
      description: 'chat.messageActions.manageDeleteLocked',
    });
    expect(row.props.onPress).toBeUndefined();
    expect(
      renderer.root
        .findAllByType('Button')
        .some((button) => button.props.testID.endsWith('-delete')),
    ).toBe(false);
  });

  test('shows a quiet empty state while all actions remain available in More', () => {
    render(normalizeAssistantMessageToolbarConfig({ pinned: [], overflow: [] }));
    expect(
      renderer.root
        .findAllByType('SectionItem')
        .some((item) => item.props.label === 'chat.messageActions.managePinnedEmpty'),
    ).toBe(true);
    expect(renderer.root.findAllByType('SortableItem')).toHaveLength(8);
    expect(renderer.root.findAllByType('Button').every((button) => !button.props.disabled)).toBe(
      true,
    );
  });
});
