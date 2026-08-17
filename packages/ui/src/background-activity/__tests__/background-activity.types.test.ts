import type { BackgroundActivityPresentation } from '../background-activity.types';

type ForbiddenVisualOverrides = Extract<
  | 'backgroundColor'
  | 'children'
  | 'className'
  | 'color'
  | 'colorScheme'
  | 'iconComponent'
  | 'layout'
  | 'logoUri'
  | 'renderContent'
  | 'renderIcon'
  | 'spacing'
  | 'style'
  | 'typography',
  keyof BackgroundActivityPresentation
>;

const hasNoVisualOverrides: ForbiddenVisualOverrides extends never ? true : false = true;
const hasControlledIcons: string extends BackgroundActivityPresentation['icon'] ? false : true =
  true;
const hasControlledCompactIcons: string extends BackgroundActivityPresentation['compactIcon']
  ? false
  : true = true;

describe('BackgroundActivityPresentation', () => {
  test('does not expose visual override props', () => {
    expect(hasNoVisualOverrides).toBe(true);
  });

  test('limits callers to registered icons', () => {
    expect(hasControlledIcons).toBe(true);
    expect(hasControlledCompactIcons).toBe(true);
  });
});
