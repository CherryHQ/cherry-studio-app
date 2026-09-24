import type { ConversationMessage } from '@/frontend/appShell/conversation';
import type {
  HistoryVersion,
  RemoteConversationSnapshot,
} from '@/frontend/appShell/conversation/remote';

import { ConversationPresenter } from '../ConversationPresenter';

const message = (key: string): ConversationMessage => ({
  key,
  state: 'success',
  completeness: 'complete',
  actions: {},
  display: { id: key, role: 'assistant', status: 'success', data: {} },
});
const version = (value: string) => value as HistoryVersion;
const snapshot = (
  liveMessages: ConversationMessage[],
  revision: string,
): RemoteConversationSnapshot => ({
  liveMessages,
  historyVersion: version(revision),
  title: '',
  freshness: { state: 'current' },
  executions: [],
  interactions: [],
  actions: { inputPolicy: { attachments: false, pluginReferences: false, modelSelection: false } },
});

it('retains a removed live row across failed and stale history reads until the new revision installs', () => {
  const presenter = new ConversationPresenter();
  const row = message('answer');
  const first = presenter.update(snapshot([row], '1'), [], version('1'));
  expect(presenter.update(snapshot([], '2'), [], undefined)).toBe(first);
  expect(presenter.update(snapshot([], '2'), [], version('1'))).toBe(first);
  const persisted = { ...row };
  expect(presenter.update(snapshot([], '2'), [persisted], version('2'))).toEqual([persisted]);
  expect(presenter.update(snapshot([], '3'), [], version('3'))).toEqual([]);
});

it('waits for a history version advance if the live removal precedes the session revision event', () => {
  const presenter = new ConversationPresenter();
  const row = message('answer');
  presenter.update(snapshot([row], '1'), [], version('1'));
  expect(presenter.update(snapshot([], '1'), [], version('1'))).toEqual([row]);
  expect(presenter.update(snapshot([], '2'), [], undefined)).toEqual([row]);
  expect(presenter.update(snapshot([], '2'), [], version('2'))).toEqual([]);
});

it('keeps an older search window separate from live rows and clears retained data on retirement', () => {
  const presenter = new ConversationPresenter();
  const row = message('answer');
  const older = [message('older')];
  presenter.update(snapshot([row], '1'), [], version('1'));
  expect(presenter.update(snapshot([row], '1'), older, version('1'), true)).toBe(older);
  expect(
    presenter.update({ ...snapshot([], '1'), freshness: { state: 'retired' } }, older, undefined),
  ).toEqual([]);
});

const failed = (): ConversationMessage => ({
  ...message('answer'),
  state: 'error',
  display: {
    id: 'answer',
    role: 'assistant',
    status: 'error',
    data: {
      parts: [
        {
          type: 'data-error',
          data: {
            code: 'EXECUTION_FAILED',
            message: 'Subscription required',
            reasonCode: 'permission',
          },
        },
      ],
      partKeys: ['answer:failure'],
    },
  },
});
const terminal = (
  live: ConversationMessage[] = [],
  durable = true,
): RemoteConversationSnapshot => ({
  ...snapshot(live, '2'),
  executions: [
    {
      id: 'execution',
      state: 'failed',
      terminal: { message: failed(), durable, historyReady: true },
    },
  ],
});

it('shows a failure whose message was created and removed in one batch, then hands off exactly once', () => {
  const presenter = new ConversationPresenter();
  expect(presenter.update(terminal(), [], undefined)).toEqual([failed()]);
  expect(presenter.update(terminal(), [], version('2'))).toEqual([failed()]);
  const persisted = failed();
  expect(presenter.update(terminal(), [persisted], version('2'))).toEqual([persisted]);
  expect(presenter.update(terminal(), [persisted], version('2'))).toEqual([persisted]);
  expect(
    presenter.update({ ...terminal(), historyVersion: version('3') }, [], version('3')),
  ).toEqual([]);
});

it('retains partial text and stable part keys while a failed answer waits for history', () => {
  const presenter = new ConversationPresenter();
  const live: ConversationMessage = {
    ...message('answer'),
    state: 'streaming',
    display: {
      id: 'answer',
      role: 'assistant',
      status: 'pending',
      data: { parts: [{ type: 'text', text: 'Partial' }], partKeys: ['text'] },
    },
  };
  presenter.update(snapshot([live], '1'), [], version('1'));
  const rows = presenter.update(terminal(), [], undefined);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    state: 'error',
    display: {
      status: 'error',
      data: {
        partKeys: ['text', 'answer:failure'],
        parts: [{ type: 'text', text: 'Partial' }, { type: 'data-error' }],
      },
    },
  });
  expect(presenter.update(terminal(), [message('older')], version('2'), true)).toEqual([
    message('older'),
  ]);
  expect(presenter.update(terminal(), [], undefined)[0].display.data.parts).toHaveLength(2);
});

it('does not let an older saved row acknowledge an unsaved terminal result', () => {
  const presenter = new ConversationPresenter();
  const persisted = failed();
  persisted.display = { ...persisted.display, data: { parts: [] } };
  expect(
    presenter.update(terminal([], false), [persisted], version('2'))[0].display.data.parts,
  ).toHaveLength(1);
});
