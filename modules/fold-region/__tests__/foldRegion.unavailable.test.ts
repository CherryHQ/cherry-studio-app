import { FoldRegionObserver } from '../index';

const mockRequireNativeView = jest.fn();

jest.mock('expo', () => ({
  requireNativeView: (name: string) => mockRequireNativeView(name),
  requireOptionalNativeModule: () => null,
}));

it('exports null where the native module is missing, so the shell sees no fold', () => {
  expect(FoldRegionObserver).toBeNull();
  // Expo returns a placeholder view even without a native implementation; it must not be created.
  expect(mockRequireNativeView).not.toHaveBeenCalled();
});
