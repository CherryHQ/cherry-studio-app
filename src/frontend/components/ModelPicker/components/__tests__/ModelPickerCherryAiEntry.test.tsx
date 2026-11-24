import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CloudState } from '@/shared/contracts/cloud';

import { ModelPickerCherryAiEntry } from '../ModelPickerCherryAiEntry';

jest.mock('@cherrystudio/ui/components', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  const { createElement } = jest.requireActual('react');
  return {
    Button: ({
      children,
      icon,
      ...props
    }: {
      children: ReactNode;
      icon?: ReactNode;
      loading?: boolean;
      onPress: () => void;
      testID?: string;
    }) => createElement('Button', props, icon, createElement(MockText, null, children)),
    Spinner: (props: Record<string, unknown>) =>
      createElement('Spinner', { ...props, testID: 'spinner' }),
  };
});

jest.mock('@cherrystudio/ui/utils', () => ({
  cn: (...names: unknown[]) => names.filter(Boolean).join(' '),
}));

jest.mock('@cherrystudio/app-icons/icons/circle-alert', () => {
  const { createElement } = jest.requireActual('react');
  return function MockCircleAlertIcon(props: Record<string, unknown>) {
    return createElement('CircleAlertIcon', { ...props, testID: 'circle-alert-icon' });
  };
});

jest.mock('@cherrystudio/app-icons/icons/refresh-cw', () => {
  const { createElement } = jest.requireActual('react');
  return function MockRefreshCwIcon(props: Record<string, unknown>) {
    return createElement('RefreshCwIcon', { ...props, testID: 'refresh-cw-icon' });
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function makeCloudState(overrides: Partial<CloudState> = {}): CloudState {
  return {
    account: null,
    isRefreshing: false,
    models: [],
    phase: 'signed_out',
    plans: null,
    ...overrides,
  };
}

describe('ModelPickerCherryAiEntry', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test.each([
    ['guestCatalog error', makeCloudState({ guestCatalog: 'error', phase: 'signed_out' })],
    ['signed-in phase error', makeCloudState({ phase: 'error' })],
  ])('renders service unavailable inline status and retries for %s', (_label, state) => {
    const onRetry = jest.fn();

    act(() => {
      renderer = create(
        <ModelPickerCherryAiEntry onRetry={onRetry} restoring={false} state={state} />,
      );
    });

    const card = renderer!.root.findByProps({ testID: 'model-picker-cherryai-error' });
    const textNodes = card.findAllByType(Text).map((node) => node.props.children);
    expect(textNodes).toEqual(['chat.errorPart.reason.providerUnavailable', 'common.retry']);
    expect(card.findByProps({ testID: 'circle-alert-icon' }).props.className).toContain(
      'text-error',
    );
    expect(card.findAllByProps({ testID: 'refresh-cw-icon' })).toHaveLength(1);

    const retryButton = renderer!.root.findByProps({ testID: 'model-picker-cherryai-retry' });
    expect(retryButton.props.loading).toBe(false);
    act(() => retryButton.props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);

    act(() => {
      renderer!.update(
        <ModelPickerCherryAiEntry
          onRetry={onRetry}
          restoring={false}
          state={{ ...state, isRefreshing: true }}
        />,
      );
    });
    expect(
      renderer!.root.findByProps({ testID: 'model-picker-cherryai-retry' }).props.loading,
    ).toBe(true);
  });

  test('renders sessionExpired warning and sign-in action without retry spinner when reauth is required', () => {
    const onRetry = jest.fn();
    const state = makeCloudState({
      accountIssue: 'reauth_required',
      isRefreshing: true,
      phase: 'error',
    });

    act(() => {
      renderer = create(
        <ModelPickerCherryAiEntry onRetry={onRetry} restoring={false} state={state} />,
      );
    });

    const card = renderer!.root.findByProps({ testID: 'model-picker-cherryai-error' });
    const textNodes = card.findAllByType(Text).map((node) => node.props.children);
    expect(textNodes).toEqual(['cloud.sessionExpired', 'account.login.reSignIn']);
    expect(textNodes).not.toContain('chat.errorPart.reason.providerUnavailable');
    expect(card.findByProps({ testID: 'circle-alert-icon' }).props.className).toContain(
      'text-warning',
    );
    expect(card.findAllByProps({ testID: 'refresh-cw-icon' })).toHaveLength(0);

    const retryButton = renderer!.root.findByProps({ testID: 'model-picker-cherryai-retry' });
    expect(retryButton.props.loading).toBe(false);
    act(() => retryButton.props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('renders accountDisabled status with retry action when account is disabled', () => {
    const state = makeCloudState({
      accountIssue: 'account_disabled',
      phase: 'error',
    });

    act(() => {
      renderer = create(
        <ModelPickerCherryAiEntry onRetry={jest.fn()} restoring={false} state={state} />,
      );
    });

    const card = renderer!.root.findByProps({ testID: 'model-picker-cherryai-error' });
    expect(card.findAllByType(Text).map((node) => node.props.children)).toEqual([
      'cloud.accountDisabled',
      'common.retry',
    ]);
  });

  test.each([
    ['restoring session', true, makeCloudState({ guestCatalog: 'ready', phase: 'signed_out' })],
    ['signed-in loading', false, makeCloudState({ phase: 'loading' })],
    [
      'guest catalog loading',
      false,
      makeCloudState({ guestCatalog: 'loading', phase: 'signed_out' }),
    ],
  ])(
    'renders spinner and loading text without retry button when %s',
    (_label, restoring, state) => {
      act(() => {
        renderer = create(
          <ModelPickerCherryAiEntry onRetry={jest.fn()} restoring={restoring} state={state} />,
        );
      });

      const loadingRow = renderer!.root.findByProps({ testID: 'model-picker-cherryai-loading' });
      expect(loadingRow.findAllByProps({ testID: 'spinner' })).toHaveLength(1);
      expect(loadingRow.findAllByType(Text).map((node) => node.props.children)).toEqual([
        'settings.provider.models.loading',
      ]);
      expect(renderer!.root.findAllByProps({ testID: 'model-picker-cherryai-retry' })).toHaveLength(
        0,
      );
    },
  );

  test.each([
    ['signed-in ready', makeCloudState({ phase: 'ready' })],
    ['guest catalog ready', makeCloudState({ guestCatalog: 'ready', phase: 'signed_out' })],
  ])('renders muted empty message without spinner or retry button when %s', (_label, state) => {
    act(() => {
      renderer = create(
        <ModelPickerCherryAiEntry onRetry={jest.fn()} restoring={false} state={state} />,
      );
    });

    const emptyRow = renderer!.root.findByProps({ testID: 'model-picker-cherryai-empty' });
    expect(emptyRow.findAllByType(Text).map((node) => node.props.children)).toEqual([
      'modelPicker.empty',
    ]);
    expect(renderer!.root.findAllByProps({ testID: 'spinner' })).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ testID: 'model-picker-cherryai-retry' })).toHaveLength(
      0,
    );
  });
});
