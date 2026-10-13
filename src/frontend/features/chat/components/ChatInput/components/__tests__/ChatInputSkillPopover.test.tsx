import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data/BackendProvider';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import { SkillQueryBridge } from '@/frontend/data/SkillQueryBridge';
import { useAgentSkillsApi } from '@/frontend/hooks/skill';
import type { Backend } from '@/shared/contracts';
import type { ApiClient } from '@/shared/data/api/types';
import type { SkillListItem } from '@/shared/data/types/skill';

import { ChatInputSkillPopover } from '../ChatInputSkillPopover';

jest.mock('@cherrystudio/app-icons/icons/check', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/tool-case', () => () => null);
jest.mock('@cherrystudio/ui/components', () => ({
  Button: () => null,
  Composer: {
    Popover: ({
      children,
      content,
      open,
    }: {
      children: ReactNode;
      content: ReactNode;
      open: boolean;
    }) => (
      <>
        {children}
        {open ? content : null}
      </>
    ),
  },
}));
jest.mock('@/frontend/components/Composer', () => ({
  useComposerMeta: () => ({ inputRef: { current: null } }),
  useComposerState: () => ({ draft: '' }),
}));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const installed = {
  id: 'skill-1',
  name: 'installed',
  binding: { isEnabled: true },
} as SkillListItem;
const onClose = jest.fn();
let installationListener: (() => void) | undefined;
const unsubscribe = jest.fn(() => {
  installationListener = undefined;
});
const backend = {
  skills: {
    subscribeChanges: (listener: () => void) => {
      installationListener = listener;
      return unsubscribe;
    },
  },
} as unknown as Backend;
const get = jest.fn<Promise<{ items: SkillListItem[] }>, [string]>();
const dataApi = { get } as unknown as ApiClient;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;
let editorSkills: readonly SkillListItem[];

function AgentSkillsProbe() {
  const { skills } = useAgentSkillsApi('agent-1');
  useEffect(() => {
    editorSkills = skills;
  }, [skills]);
  return null;
}

async function render(open: boolean) {
  await act(async () => {
    const tree = (
      <QueryClientProvider client={queryClient}>
        <BackendProvider backend={backend}>
          <DataApiProvider dataApi={dataApi}>
            <SkillQueryBridge />
            <AgentSkillsProbe />
            <ChatInputSkillPopover agentId="agent-1" onClose={onClose} open={open}>
              {null}
            </ChatInputSkillPopover>
          </DataApiProvider>
        </BackendProvider>
      </QueryClientProvider>
    );
    if (renderer) renderer.update(tree);
    else renderer = create(tree);
  });
  await flushQueryNotifications();
}

async function flushQueryNotifications() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  get.mockReset();
  unsubscribe.mockClear();
  editorSkills = [];
  queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false, staleTime: 30_000 } },
  });
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  queryClient.clear();
});

it('refreshes a closed menu and the Agent list as soon as an installation commits', async () => {
  get.mockResolvedValue({ items: [] });
  await render(false);
  expect(get).toHaveBeenCalledTimes(2);

  get.mockResolvedValue({ items: [installed] });
  await act(async () => installationListener?.());
  await flushQueryNotifications();
  expect(get).toHaveBeenCalledTimes(4);
  expect(editorSkills).toEqual([installed]);

  await render(true);
  expect(
    renderer?.root.findByProps({ testID: 'chat-skill-skill-1' }).props.accessibilityLabel,
  ).toBe('installed');
  expect(get).toHaveBeenCalledTimes(4);
});

it('replaces pending first reads and ignores their late pre-installation results', async () => {
  const oldAgentRead = deferred();
  const oldComposerRead = deferred();
  get.mockImplementation((path) =>
    path === '/skills' ? oldComposerRead.promise : oldAgentRead.promise,
  );
  await render(false);

  get.mockResolvedValue({ items: [installed] });
  await act(async () => installationListener?.());
  await flushQueryNotifications();
  expect(get).toHaveBeenCalledTimes(4);
  expect(editorSkills).toEqual([installed]);

  await act(async () => {
    oldAgentRead.resolve({ items: [] });
    oldComposerRead.resolve({ items: [] });
  });
  await flushQueryNotifications();
  await render(true);
  expect(editorSkills).toEqual([installed]);
  expect(
    renderer?.root.findByProps({ testID: 'chat-skill-skill-1' }).props.accessibilityLabel,
  ).toBe('installed');
});

function deferred() {
  let resolve!: (value: { items: SkillListItem[] }) => void;
  const promise = new Promise<{ items: SkillListItem[] }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
