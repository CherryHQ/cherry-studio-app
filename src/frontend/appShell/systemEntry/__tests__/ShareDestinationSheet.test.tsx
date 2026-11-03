import type { ComponentProps, ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentSessionsOptions, AgentSessionsViewModel } from '@/frontend/hooks/agent';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';

import { ShareDestinationSheet } from '../ShareDestinationSheet';

type Props = ComponentProps<typeof ShareDestinationSheet>;
type AgentResult = {
  agent?: { id: string; name: string };
  error?: Error;
  isLoading: boolean;
};

let mockCatalog: AgentSessionsViewModel;
let mockAgents: Record<string, AgentResult>;
const mockUseAgentSessions = jest.fn((_options?: AgentSessionsOptions) => mockCatalog);
const mockInvalidateQueries = jest.fn();
const onCancel = jest.fn();
const onSelect = jest.fn();
let renderer: ReactTestRenderer | undefined;

jest.mock('@/frontend/hooks/agent', () => ({
  useAgentSessions: (...args: [AgentSessionsOptions?]) => mockUseAgentSessions(...args),
  useAgentApiById: (id: string) => mockAgents[id] ?? { isLoading: false },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}: ${values.name} · ${values.id}` : key,
  }),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  const control = (name: string) => (props: object) => createElement(name, props);
  return {
    BottomSheet: ({ footer, ...props }: { children?: ReactNode; footer?: ReactNode }) =>
      createElement('BottomSheet', props, props.children, footer),
    Button: Object.assign(control('Button'), {
      Label: ({ children }: { children?: ReactNode }) => children,
    }),
    ContentState: {
      Empty: control('Empty'),
      Error: control('Error'),
      Loading: control('Loading'),
    },
    SearchField: control('SearchField'),
  };
});

function session(id: string, name: string, agentId = 'agent-1'): AgentSessionEntity {
  return {
    id,
    agentId,
    name,
    isNameManuallyEdited: false,
    forkBoundaryMessageId: null,
    forkedFromSessionId: null,
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
    lastActivityAt: '2026-11-03T00:00:00.000Z',
  };
}

function render(props: Partial<Props> = {}) {
  act(() => {
    const element = (
      <ShareDestinationSheet
        defaultAgentId="caller-agent"
        onCancel={onCancel}
        onSelect={onSelect}
        open
        {...props}
      />
    );
    if (renderer) renderer.update(element);
    else renderer = create(element);
  });
}

function press(testID: string) {
  act(() => renderer!.root.findByProps({ testID }).props.onPress());
}

function search(value: string) {
  act(() =>
    renderer!.root.findByProps({ testID: 'share-destination-search' }).props.onChangeText(value),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAgents = {
    'agent-1': { agent: { id: 'agent-1', name: 'Research' }, isLoading: false },
    'agent-2': { agent: { id: 'agent-2', name: 'Writing' }, isLoading: false },
  };
  mockCatalog = {
    sessions: [session('one', 'Travel plans'), session('two', 'Weekly notes', 'agent-2')],
    hasMore: false,
    isLoadingInitial: false,
    isLoadingMore: false,
    loadMore: jest.fn(async () => {}),
  };
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

it('offers both entry points and loads sessions only after choosing Existing', () => {
  render();
  expect(renderer!.root.findByProps({ testID: 'share-destination-new' })).toBeTruthy();
  expect(renderer!.root.findByProps({ testID: 'share-destination-existing' })).toBeTruthy();
  expect(mockUseAgentSessions).not.toHaveBeenCalled();

  press('share-destination-existing');

  expect(renderer!.root.findByProps({ testID: 'share-destination-session-one' })).toBeTruthy();
  expect(renderer!.root.findByProps({ testID: 'share-destination-session-two' })).toBeTruthy();
  expect(onSelect).not.toHaveBeenCalled();
});

it('reports a new draft under the caller Agent without cancelling', () => {
  render();
  press('share-destination-new');
  expect(onSelect.mock.calls).toEqual([[{ kind: 'draft', agentId: 'caller-agent' }]]);
  expect(onCancel).not.toHaveBeenCalled();
});

it('disables New when no default Agent was supplied', () => {
  render({ defaultAgentId: undefined });
  expect(renderer!.root.findByProps({ testID: 'share-destination-new' }).props.disabled).toBe(true);
  press('share-destination-new');
  expect(onSelect).not.toHaveBeenCalled();
});

it('filters titles locally by a trimmed, case-insensitive substring and clears the search', () => {
  render();
  press('share-destination-existing');
  search('  PLANS  ');
  expect(renderer!.root.findByProps({ testID: 'share-destination-session-one' })).toBeTruthy();
  expect(renderer!.root.findAllByProps({ testID: 'share-destination-session-two' })).toHaveLength(
    0,
  );
  expect(mockUseAgentSessions.mock.calls.every((args) => args.length === 0)).toBe(true);

  act(() => renderer!.root.findByProps({ testID: 'share-destination-search' }).props.onClear());
  expect(renderer!.root.findByProps({ testID: 'share-destination-session-two' })).toBeTruthy();
});

it('distinguishes equal titles by Agent and selects only the requested session', () => {
  mockCatalog.sessions = [session('one', 'Notes'), session('two', 'Notes', 'agent-2')];
  render();
  press('share-destination-existing');
  const first = renderer!.root.findByProps({ testID: 'share-destination-session-one' });
  const second = renderer!.root.findByProps({ testID: 'share-destination-session-two' });
  expect(first.props.accessibilityLabel).toContain('Research · agent-1');
  expect(second.props.accessibilityLabel).toContain('Writing · agent-2');

  press('share-destination-session-two');
  expect(onSelect.mock.calls).toEqual([[{ kind: 'session', sessionId: 'two' }]]);
  expect(onCancel).not.toHaveBeenCalled();
});

it.each([
  ['missing or deleted', { isLoading: false }, 'unavailable'],
  ['loading', { isLoading: true }, 'checkingAgent'],
  ['failed', { isLoading: false, error: new Error('private diagnostic') }, 'unavailable'],
  [
    'stale after a failed lookup',
    { isLoading: false, agent: { id: 'agent-1', name: 'Old' }, error: new Error('failed') },
    'unavailable',
  ],
] satisfies [string, AgentResult, string][])(
  'disables a session whose Agent is %s and explains its status',
  (_name, result, status) => {
    mockAgents['agent-1'] = result;
    render();
    press('share-destination-existing');
    const row = renderer!.root.findByProps({ testID: 'share-destination-session-one' });
    expect(row.props.disabled).toBe(true);
    expect(row.props.accessibilityState.disabled).toBe(true);
    expect(row.props.accessibilityLabel).toContain(`systemEntry.destination.${status}`);
    expect(JSON.stringify(renderer!.toJSON())).not.toContain('private diagnostic');
    press('share-destination-session-one');
    expect(onSelect).not.toHaveBeenCalled();
  },
);

it.each(['close', 'cancel'] as const)(
  'only cancels on %s, including from the list step',
  (action) => {
    render();
    press('share-destination-existing');
    if (action === 'close') {
      act(() => renderer!.root.findByType('BottomSheet' as never).props.onClose());
    } else {
      press('share-destination-cancel');
    }
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  },
);

it('returns to the choices on Back and starts fresh after a controlled close', () => {
  render();
  press('share-destination-existing');
  search('plans');
  act(() => renderer!.root.findByType('BottomSheet' as never).props.backAction.onPress());
  expect(renderer!.root.findByProps({ testID: 'share-destination-new' })).toBeTruthy();
  press('share-destination-existing');
  search('notes');
  render({ open: false });
  render();
  expect(renderer!.root.findByProps({ testID: 'share-destination-existing' })).toBeTruthy();
  press('share-destination-existing');
  expect(renderer!.root.findByProps({ testID: 'share-destination-search' }).props.value).toBe('');
  expect(onCancel).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});

it('shows loading, a retryable error, empty, and no-match ContentState surfaces', () => {
  mockCatalog.isLoadingInitial = true;
  render();
  press('share-destination-existing');
  expect(renderer!.root.findByType('Loading' as never).props.title).toBe(
    'systemEntry.destination.loading',
  );

  mockCatalog.isLoadingInitial = false;
  mockCatalog.error = new Error('private diagnostic');
  render();
  const error = renderer!.root.findByType('Error' as never);
  expect(error.props.title).toBe('systemEntry.destination.loadFailed');
  act(() => error.props.primaryAction.onPress());
  expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['/agent-sessions'] });

  mockCatalog.error = undefined;
  mockCatalog.sessions = [];
  render();
  expect(renderer!.root.findByType('Empty' as never).props.title).toBe(
    'systemEntry.destination.empty',
  );
  search('missing');
  expect(renderer!.root.findByType('Empty' as never).props.title).toBe(
    'systemEntry.destination.noResults',
  );
});

it('keeps pagination available after no local matches and filters newly loaded sessions', () => {
  mockCatalog.hasMore = true;
  render();
  press('share-destination-existing');
  search('later');
  press('share-destination-load-more');
  expect(mockCatalog.loadMore).toHaveBeenCalledTimes(1);

  mockCatalog.isLoadingMore = true;
  render();
  expect(renderer!.root.findByProps({ testID: 'share-destination-load-more' }).props.disabled).toBe(
    true,
  );

  mockCatalog.sessions = [...mockCatalog.sessions, session('three', 'Later plans')];
  mockCatalog.isLoadingMore = false;
  mockCatalog.hasMore = false;
  render();
  expect(renderer!.root.findByProps({ testID: 'share-destination-session-three' })).toBeTruthy();
  expect(renderer!.root.findAllByProps({ testID: 'share-destination-session-one' })).toHaveLength(
    0,
  );
  expect(renderer!.root.findAllByProps({ testID: 'share-destination-load-more' })).toHaveLength(0);
});
