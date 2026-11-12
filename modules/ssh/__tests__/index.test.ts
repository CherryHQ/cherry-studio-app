import { requireOptionalNativeModule } from 'expo';

import { getSshNative } from '../index';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

test('refuses older binaries before starting commands with an incompatible result contract', () => {
  const native = { respond: jest.fn(), maintain: jest.fn(), run: jest.fn() };
  jest.mocked(requireOptionalNativeModule).mockReturnValue(native);
  expect(getSshNative()).toBeNull();
  expect(native.run).not.toHaveBeenCalled();
  jest.mocked(requireOptionalNativeModule).mockReturnValue({ ...native, resultVersion: 2 });
  expect(getSshNative()).toMatchObject({ resultVersion: 2 });
});
