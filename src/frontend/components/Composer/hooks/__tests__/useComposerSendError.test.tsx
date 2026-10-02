import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useComposerSendError } from '../useComposerSendError';

const mockToastShow = jest.fn();
const mockAlertShow = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: mockAlertShow } }),
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

describe('useComposerSendError', () => {
  let renderer: ReactTestRenderer | undefined;
  let report: ReturnType<typeof useComposerSendError> | undefined;

  function Probe() {
    report = useComposerSendError();
    return null;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(<Probe />);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('stays quiet for a send the user stopped and reports real failures', () => {
    report?.(Object.assign(new Error('The submission was cancelled.'), { name: 'AbortError' }));
    expect(mockToastShow).not.toHaveBeenCalled();
    expect(mockAlertShow).not.toHaveBeenCalled();

    report?.(new Error('network down'));
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.input.sendFailed',
      variant: 'danger',
    });
  });
});
