import { useLayoutEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cacheService } from '@/frontend/data/CacheService';

import {
  readRemoteDraft,
  useRemoteDraftModel,
  useRemoteDraftPersistence,
} from '../useRemoteDraftPersistence';

const appStateListeners = new Set<(state: AppStateStatus) => void>();
let renderer: ReactTestRenderer | undefined;

function Probe({ draftKey, text }: { draftKey: string; text: string }) {
  useRemoteDraftPersistence(draftKey, text);
  return null;
}

function render(draftKey: string, text: string) {
  act(() => {
    if (renderer) renderer.update(<Probe draftKey={draftKey} text={text} />);
    else renderer = create(<Probe draftKey={draftKey} text={text} />);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  });
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  appStateListeners.clear();
  cacheService.cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('saves the latest text once typing pauses instead of on every keystroke', () => {
  const setPersist = jest.spyOn(cacheService, 'setPersist');
  render('draft', 'h');
  render('draft', 'he');
  render('draft', 'hel');
  expect(setPersist).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(500));
  expect(setPersist).toHaveBeenCalledTimes(1);
  expect(readRemoteDraft('draft')).toBe('hel');
});

test('saves pending text when the draft closes, changes key, or the app leaves the foreground', () => {
  render('first', 'one');
  render('second', 'two');
  expect(readRemoteDraft('first')).toBe('one');
  expect(readRemoteDraft('second')).toBe('');

  act(() => appStateListeners.forEach((listener) => listener('background')));
  expect(readRemoteDraft('second')).toBe('two');

  render('second', 'three');
  act(() => renderer?.unmount());
  renderer = undefined;
  expect(readRemoteDraft('second')).toBe('three');
});

test('restores an explicit model only for the same draft and Agent, including text-only legacy drafts', () => {
  let selection!: ReturnType<typeof useRemoteDraftModel>;
  function Model({ draft, agent }: { draft: string; agent: string }) {
    const current = useRemoteDraftModel(draft, agent);
    useLayoutEffect(() => {
      selection = current;
    }, [current]);
    return null;
  }
  cacheService.setPersist('remote_agent.drafts', { first: 'unsent text' });
  act(() => {
    renderer = create(<Model draft="first" agent="a" />);
  });
  expect(selection.model).toBeUndefined();
  const model = {
    providerId: 'provider',
    modelId: 'm',
    name: 'My Model',
    providerName: 'Provider',
  };
  act(() => selection.setModel(model));
  act(() => renderer!.unmount());
  act(() => {
    renderer = create(<Model draft="first" agent="b" />);
  });
  expect(selection.model).toBeUndefined();
  act(() => renderer!.update(<Model draft="second" agent="a" />));
  expect(selection.model).toBeUndefined();
  act(() => renderer!.update(<Model draft="first" agent="a" />));
  expect(selection.model).toEqual(model);
  act(() => selection.setModel());
  expect(selection.model).toBeUndefined();
  expect(readRemoteDraft('first')).toBe('unsent text');
});
