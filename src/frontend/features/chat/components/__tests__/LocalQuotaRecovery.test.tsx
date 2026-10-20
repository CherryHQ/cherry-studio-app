import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import type { CherryMessagePart } from '@/shared/data/types/message';

import { LocalQuotaRecovery } from '../LocalQuotaRecovery';

const mockProviders = [
  {
    id: 'configured-provider',
    name: 'My account',
    websites: { billing: 'https://billing.example.com' },
  },
  { id: 'gateway', name: 'Gateway' },
];
const mockUseProviders = jest.fn(() => ({ providers: mockProviders }));

jest.mock('@/frontend/hooks/chat/useProvider', () => ({
  useProviders: () => mockUseProviders(),
}));
jest.mock('@/frontend/utils/openExternalUrl', () => ({ openExternalUrl: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, values: { provider: string }) => `Billing: ${values.provider}`,
  }),
}));
jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    BackgroundPressExclusion: (props: object) => createElement('View', props),
    ContextMenuExclusion: (props: object) => createElement('View', props),
    Button: (props: object) => createElement('Button', props),
  };
});

beforeEach(() => jest.clearAllMocks());

test('opens only the attributed configured provider billing page after an explicit press', () => {
  const renderer = render(
    message([failure('configured-provider'), failure('configured-provider')]),
  );
  const actions = renderer.root.findAllByType('Button');
  expect(actions).toHaveLength(1);
  expect(actions[0].props.children).toBe('Billing: My account');
  expect(openExternalUrl).not.toHaveBeenCalled();
  act(() => actions[0].props.onPress());
  expect(openExternalUrl).toHaveBeenCalledWith('https://billing.example.com');
  act(() => renderer.unmount());
});

test.each(['gateway', 'missing', 'openai'])(
  'does not infer a destination for an unavailable or ineligible account: %s',
  (providerId) => {
    const renderer = render(message([failure(providerId)]));
    expect(renderer.root.findAllByType('Button')).toHaveLength(0);
    expect(openExternalUrl).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  },
);

test.each([
  message([failure('configured-provider', 'rate_limit')]),
  message([failure(undefined)]),
  { ...message([failure('configured-provider')]), status: 'pending' as const },
  { ...message([failure('configured-provider')]), role: 'user' as const },
])('does not read local accounts without a settled attributed assistant quota failure', (input) => {
  const renderer = render(input);
  expect(renderer.root.findAllByType('Button')).toHaveLength(0);
  expect(mockUseProviders).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test.each(['configured-provider', ['configured-provider'], null])(
  'ignores a quota snapshot without a structured provider context',
  (context) => {
    const renderer = render(
      message([{ type: 'data-error', data: { reasonCode: 'quota', context } }]),
    );
    expect(renderer.root.findAllByType('Button')).toHaveLength(0);
    expect(mockUseProviders).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  },
);

function failure(
  providerId: string | undefined,
  reasonCode: 'quota' | 'rate_limit' = 'quota',
): CherryMessagePart {
  return {
    type: 'data-error',
    data: {
      code: 'EXECUTION_FAILED',
      reasonCode,
      message: 'openai billing text is not a destination',
      context: providerId ? { providerId } : {},
    },
  };
}

function message(parts: CherryMessagePart[]): MessageListItem {
  return { id: 'message', role: 'assistant', status: 'error', data: { parts } };
}

function render(input: MessageListItem): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<LocalQuotaRecovery message={input} />);
  });
  return renderer;
}
