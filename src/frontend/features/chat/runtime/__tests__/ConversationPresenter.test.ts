import type {
  ConversationMessage,
  ConversationSnapshot,
  HistoryVersion,
  MessageRef,
} from '@/frontend/appShell/conversation';

import { ConversationPresenter } from '../ConversationPresenter';

const message = (key: string): ConversationMessage => ({
  ref: key as MessageRef,
  key,
  state: 'success',
  completeness: 'complete',
  actions: {},
  display: { id: key, role: 'assistant', status: 'success', data: {} },
});
const version = (value: string) => value as HistoryVersion;
const snapshot = (liveMessages: ConversationMessage[], revision: string): ConversationSnapshot => ({
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
