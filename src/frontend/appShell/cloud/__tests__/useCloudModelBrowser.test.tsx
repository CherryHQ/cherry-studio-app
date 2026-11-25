import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CloudModel, CloudModule, CloudState } from '@/shared/contracts/cloud';

import { useCloudModelBrowser } from '../useCloudModelBrowser';

const mockRefresh = jest.fn(async () => undefined);
const mockRefreshProvider = jest.fn(async () => undefined);
const mockRefreshAmd = jest.fn(async () => undefined);

const signedOutState: CloudState = {
  phase: 'signed_out',
  isRefreshing: false,
  account: null,
  plans: null,
  models: [],
  guestCatalog: 'ready',
};

let mockCloudState: CloudState = signedOutState;

const mockCloud: CloudModule = {
  getState: () => mockCloudState,
  subscribe: () => () => undefined,
  refresh: mockRefresh,
  refreshProvider: mockRefreshProvider,
  refreshAmd: mockRefreshAmd,
  createActivationEntry: jest.fn(async () => ''),
};

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: jest.fn() } }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/appShell/account', () => ({
  accountSignInHref: jest.fn(() => '/login'),
  rememberCloudModelTap: jest.fn((href: string) => href),
  useAccount: () => ({
    account: { getState: () => ({ isEnterprise: false, isRestoringSession: false }) },
    state: { isEnterprise: false, isRestoringSession: false },
  }),
}));

jest.mock('@/frontend/hooks/useCloud', () => ({
  useCloud: () => ({ cloud: mockCloud, state: mockCloudState }),
}));

jest.mock('../useCloudModelActivation', () => ({
  useCloudModelActivation: () => jest.fn(),
}));

const lockedAmdModel: CloudModel = {
  id: 'amd/gpt-oss',
  display_name: 'GPT-OSS',
  endpoint_type: 'openai-chat-completions',
  context_window: 8000,
  max_output_tokens: 512,
  capabilities: [],
  available_features: ['chat', 'translate'],
  requires_login: true,
  requires_plan: false,
  is_free: true,
  standalone: false,
  provider: 'amd',
  activation_required: true,
  activation_endpoint: '/api/v1/amd/desktop/entry',
};

const readyAccountState: CloudState = {
  phase: 'ready',
  isRefreshing: false,
  account: {
    measured_at: '2026-11-25T00:00:00Z',
    account: { id: 'account-1', status: 'active' },
    device: { id: 'device-1' },
    entitlements: [],
    quota_pools: [],
  },
  plans: null,
  models: [lockedAmdModel],
};

function Probe({ autoRefresh, enabled }: { autoRefresh?: boolean; enabled: boolean }) {
  const { refresh } = useCloudModelBrowser(enabled, 'agent', { autoRefresh });
  return <Pressable onPress={refresh} testID="manual-refresh" />;
}

describe('useCloudModelBrowser', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCloudState = signedOutState;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('refreshes AMD status when signed in and browsing locked AMD offers', () => {
    mockCloudState = readyAccountState;

    act(() => {
      renderer = create(<Probe enabled />);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefreshAmd).toHaveBeenCalledTimes(1);
  });

  it('skips mount refreshes when autoRefresh is disabled while preserving manual refresh', () => {
    mockCloudState = readyAccountState;

    act(() => {
      renderer = create(<Probe autoRefresh={false} enabled />);
    });

    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockRefreshAmd).not.toHaveBeenCalled();
    expect(mockRefreshProvider).not.toHaveBeenCalled();

    act(() => {
      renderer!.root.findByProps({ testID: 'manual-refresh' }).props.onPress();
    });

    expect(mockRefreshProvider).toHaveBeenCalledTimes(1);
  });

  it('does not refresh AMD status while signed out', () => {
    mockCloudState = { ...signedOutState, models: [lockedAmdModel] };

    act(() => {
      renderer = create(<Probe enabled />);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefreshAmd).not.toHaveBeenCalled();
  });

  it('does not refresh AMD status when no locked AMD offer exists', () => {
    mockCloudState = {
      ...readyAccountState,
      models: [{ ...lockedAmdModel, activation_required: false }],
    };

    act(() => {
      renderer = create(<Probe enabled />);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefreshAmd).not.toHaveBeenCalled();
  });

  it('does not refresh catalog or AMD status while disabled', () => {
    mockCloudState = readyAccountState;

    act(() => {
      renderer = create(<Probe enabled={false} />);
    });

    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockRefreshAmd).not.toHaveBeenCalled();
  });

  it('re-probes AMD status when reopening the picker after unsupported without looping while open', () => {
    mockCloudState = readyAccountState;

    act(() => {
      renderer = create(<Probe enabled />);
    });
    expect(mockRefreshAmd).toHaveBeenCalledTimes(1);

    mockCloudState = { ...readyAccountState, amd: { phase: 'unsupported' } };
    act(() => {
      renderer!.update(<Probe enabled />);
    });
    expect(mockRefreshAmd).toHaveBeenCalledTimes(1);

    act(() => {
      renderer!.update(<Probe enabled={false} />);
    });
    act(() => {
      renderer!.update(<Probe enabled />);
    });
    expect(mockRefreshAmd).toHaveBeenCalledTimes(2);
  });

  it('probes AMD status on mount when starting in unsupported state', () => {
    mockCloudState = { ...readyAccountState, amd: { phase: 'unsupported' } };

    act(() => {
      renderer = create(<Probe enabled />);
    });

    expect(mockRefreshAmd).toHaveBeenCalledTimes(1);
  });

  it.each<{ label: string; state: CloudState }>([
    {
      label: 'account status is disabled',
      state: {
        ...readyAccountState,
        account: {
          ...readyAccountState.account!,
          account: { id: 'account-1', status: 'disabled' },
        },
      },
    },
    {
      label: 'accountIssue is set',
      state: {
        ...readyAccountState,
        accountIssue: 'reauth_required',
      },
    },
    {
      label: 'activation_endpoint is null',
      state: {
        ...readyAccountState,
        models: [{ ...lockedAmdModel, activation_endpoint: null }],
      },
    },
    {
      label: 'model requires a plan without entitlement',
      state: {
        ...readyAccountState,
        models: [{ ...lockedAmdModel, requires_plan: true }],
      },
    },
  ])('does not refresh AMD status when $label', ({ state }) => {
    mockCloudState = state;

    act(() => {
      renderer = create(<Probe enabled />);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefreshAmd).not.toHaveBeenCalled();
  });
});
