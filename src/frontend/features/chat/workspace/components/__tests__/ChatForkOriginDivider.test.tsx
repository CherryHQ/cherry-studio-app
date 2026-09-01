import { I18nextProvider } from 'react-i18next';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import i18n, { initI18n } from '@/frontend/i18n';

import { ChatForkOriginDivider } from '../ChatForkOriginDivider';

const mockSetParams = jest.fn();
let mockSource: { agentId: string; title: string } | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({ setParams: mockSetParams }),
}));

jest.mock('@/frontend/hooks/agent', () => ({
  useAgentSession: () => ({ data: mockSource }),
}));

describe('ChatForkOriginDivider', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeAll(async () => {
    await initI18n('en-US');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSource = { agentId: 'agent-1', title: 'Arithmetic drills' };
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  test('names the source session inside the translated sentence', async () => {
    await renderDivider();

    // The surrounding words must read in the target language's order, and the
    // title must land *inside* its own slot: that slot is what carries the link
    // affordance, and an unparsed one silently degrades to plain text.
    const row = renderer!.root.findByProps({ testID: 'chat-fork-origin' });
    const slot = renderer!.root.findAllByProps({ className: 'text-foreground underline' })[0];

    expect(collectText(row)).toBe('Branched from Arithmetic drills');
    expect(collectText(slot)).toBe('Arithmetic drills');
  });

  test('returns to the source session by swapping route params', async () => {
    await renderDivider();

    const row = renderer?.root.findByProps({ testID: 'chat-fork-origin' });
    await act(async () => row?.props.onPress());

    expect(mockSetParams).toHaveBeenCalledWith({
      agentId: undefined,
      sessionId: 'source-1',
    });
  });

  test('stays hidden while the source session is unresolved', async () => {
    mockSource = undefined;
    await renderDivider();

    expect(renderer?.root.findAllByProps({ testID: 'chat-fork-origin' })).toHaveLength(0);
  });

  async function renderDivider() {
    await act(async () => {
      renderer = create(
        <I18nextProvider i18n={i18n}>
          <ChatForkOriginDivider sourceSessionId="source-1" />
        </I18nextProvider>,
      );
    });
  }
});

function collectText(instance: ReactTestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : collectText(child)))
    .join('');
}
