import { type ReactNode, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationSource } from '../contracts';
import { ConversationSourceBoundary, useConversationSource } from '../ConversationSourceBoundary';

const mockModule = { open: jest.fn() };

jest.mock('../ConversationProvider', () => ({ useConversationSources: () => mockModule }));
jest.mock('@cherrystudio/ui/components', () => ({ ContentState: {} }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function Frame({ children }: { children?: ReactNode }) {
  const [count, setCount] = useState(0);
  return (
    <>
      <Pressable testID="header-action" onPress={() => setCount((value) => value + 1)}>
        <Text testID="header-state">{count}</Text>
      </Pressable>
      {children}
    </>
  );
}

function ConnectedContent() {
  const { ref } = useConversationSource();
  const connectionId = ref.kind === 'desktop' ? ref.connectionId : 'local';
  return <Text testID="connected-device">{connectionId}</Text>;
}

function Harness({ connectionId }: { connectionId: string }) {
  return (
    <ConversationSourceBoundary
      source={{ kind: 'desktop', connectionId }}
      fallback={() => <Frame />}
    >
      <Frame>
        <ConnectedContent />
      </Frame>
    </ConversationSourceBoundary>
  );
}

function lease(connectionId = 'pc-1') {
  return {
    source: {
      ref: { kind: 'desktop', connectionId },
      state: {
        getSnapshot: () => ({ availability: { state: 'enabled' } }),
        subscribe: () => () => {},
      },
    } as unknown as ConversationSource,
    release: jest.fn(),
  };
}
function deferredLease() {
  let resolve!: (value: ReturnType<typeof lease>) => void;
  const promise = new Promise<ReturnType<typeof lease>>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe('ConversationSourceBoundary ownership', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockModule.open.mockReset();
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('retains header state when loading content becomes connected content', async () => {
    const pending = deferredLease();
    mockModule.open.mockReturnValue(pending.promise);
    await act(async () => {
      renderer = create(<Harness connectionId="pc-1" />);
    });
    await act(async () => {
      renderer!.root.findByProps({ testID: 'header-action' }).props.onPress();
    });

    await act(async () => pending.resolve(lease()));

    expect(renderer!.root.findByProps({ testID: 'header-state' }).props.children).toBe(1);
    expect(renderer!.root.findByProps({ testID: 'connected-device' }).props.children).toBe('pc-1');
  });

  it('hides the previous device while acquiring another without remounting the header', async () => {
    const first = lease();
    const pending = deferredLease();
    mockModule.open.mockResolvedValueOnce(first).mockReturnValueOnce(pending.promise);
    await act(async () => {
      renderer = create(<Harness connectionId="pc-1" />);
    });
    await act(async () => {
      renderer!.root.findByProps({ testID: 'header-action' }).props.onPress();
      renderer!.update(<Harness connectionId="pc-2" />);
    });

    expect(renderer!.root.findAllByProps({ testID: 'connected-device' })).toHaveLength(0);
    expect(renderer!.root.findByProps({ testID: 'header-state' }).props.children).toBe(1);
    expect(first.release).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve(lease('pc-2')));

    expect(renderer!.root.findByProps({ testID: 'connected-device' }).props.children).toBe('pc-2');
    expect(renderer!.root.findByProps({ testID: 'header-state' }).props.children).toBe(1);
  });
});
