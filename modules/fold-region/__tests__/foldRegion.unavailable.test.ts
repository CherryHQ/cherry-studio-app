import { FoldRegionObserver } from '../index';

jest.mock('expo', () => ({
  requireNativeView: () => {
    throw new Error('FoldRegion is not in this client');
  },
}));

it('exports null where the native view is missing, so the shell sees no fold', () => {
  expect(FoldRegionObserver).toBeNull();
});
