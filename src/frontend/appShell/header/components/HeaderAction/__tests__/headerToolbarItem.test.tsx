import { Stack } from 'expo-router';
import { Children, type ReactElement, type ReactNode } from 'react';

import type { HeaderToolbarAction } from '../HeaderAction.types';
import { renderHeaderToolbarItem } from '../headerToolbarItem';

// The custom view's content is not under test.
jest.mock('../HeaderAction', () => ({ HeaderAction: () => null }));

let mockIsLiquidGlassAvailable = true;
jest.mock('@/frontend/utils/constants', () => ({
  get isLiquidGlassAvailable() {
    return mockIsLiquidGlassAvailable;
  },
}));

const Icon = () => null;
const icon: HeaderToolbarAction = {
  accessibilityLabel: 'New chat',
  icon: Icon,
  key: 'new-chat',
  nativeIcon: { height: 18, uri: 'new-chat.png', width: 18 },
  onPress: jest.fn(),
  type: 'icon',
};
const menu: Extract<HeaderToolbarAction, { type: 'menu' }> = {
  accessibilityLabel: 'More',
  icon: Icon,
  items: [
    { id: 'rename', label: 'Rename', onPress: jest.fn() },
    { checked: true, id: 'pin', label: 'Pin', onPress: jest.fn() },
    { destructive: true, group: 'danger', id: 'delete', label: 'Delete', onPress: jest.fn() },
  ],
  key: 'more',
  nativeIcon: { height: 18, uri: 'ellipsis.png', width: 18 },
  type: 'menu',
};

beforeEach(() => {
  mockIsLiquidGlassAvailable = true;
});

function children(element: ReactElement) {
  return Children.toArray((element.props as { children?: ReactNode }).children) as ReactElement[];
}

it('keeps the original glyph in a tinted native toolbar button', () => {
  const item = renderHeaderToolbarItem(icon);
  expect(item.type).toBe(Stack.Toolbar.Button);
  expect(item.props).toMatchObject({
    accessibilityLabel: 'New chat',
    icon: icon.nativeIcon,
    iconRenderingMode: 'template',
  });
});

it('maps menu groups to inline sections and keeps item states', () => {
  const item = renderHeaderToolbarItem(menu);
  expect(item.type).toBe(Stack.Toolbar.Menu);
  expect(item.props).toMatchObject({ icon: menu.nativeIcon, iconRenderingMode: 'template' });
  const sections = children(item);
  expect(sections.map((section) => section.type)).toEqual([Stack.Toolbar.Menu, Stack.Toolbar.Menu]);
  expect(sections.every((section) => (section.props as { inline?: boolean }).inline)).toBe(true);
  const [first, second] = sections.map(children);
  expect(first?.map((action) => action.props)).toMatchObject([
    { children: 'Rename' },
    { children: 'Pin', isOn: true },
  ]);
  expect(second?.map((action) => action.props)).toMatchObject([
    { children: 'Delete', destructive: true },
  ]);
});

it('lists a single group directly in the menu', () => {
  const item = renderHeaderToolbarItem({ ...menu, items: menu.items.slice(0, 2) });
  expect(children(item).map((action) => action.type)).toEqual([
    Stack.Toolbar.MenuAction,
    Stack.Toolbar.MenuAction,
  ]);
});

it('keeps the custom view without a native image or before the shared glass surface', () => {
  expect(renderHeaderToolbarItem({ ...icon, nativeIcon: undefined }).type).toBe(Stack.Toolbar.View);
  mockIsLiquidGlassAvailable = false;
  expect(renderHeaderToolbarItem(icon).type).toBe(Stack.Toolbar.View);
  expect(renderHeaderToolbarItem(menu).type).toBe(Stack.Toolbar.View);
});
