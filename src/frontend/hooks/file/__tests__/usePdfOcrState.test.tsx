import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data';
import type { Backend } from '@/shared/contracts';
import type { PdfOcrState } from '@/shared/contracts/file';

import { usePdfOcrActive, usePdfOcrState } from '../usePdfOcrState';

type Observer = (state: PdfOcrState | undefined) => void;
const observers = new Map<string, Observer>();
const file = {
  observePdfOcr: jest.fn((id: string, observer: Observer) => {
    observers.set(id, observer);
    observer(undefined);
    return () => observers.delete(id);
  }),
};

const report = jest.fn<void, [boolean]>();
const active = () => report.mock.lastCall?.[0];
function Probe({ ids }: { ids: readonly string[] }) {
  report(usePdfOcrActive(ids));
  return null;
}

test('stays active only while a listed file is recognizing, and unsubscribes', () => {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      <BackendProvider backend={{ file } as unknown as Backend}>
        <Probe ids={['a', 'b']} />
      </BackendProvider>,
    );
  });
  expect(active()).toBe(false);
  act(() => observers.get('a')!({ status: 'queued' }));
  expect(active()).toBe(false);
  act(() => observers.get('b')!({ status: 'recognizing', completedPages: 1, totalPages: 4 }));
  expect(active()).toBe(true);
  act(() => observers.get('a')!({ status: 'recognizing', completedPages: 0, totalPages: 2 }));
  act(() => observers.get('b')!(undefined));
  expect(active()).toBe(true);
  act(() => observers.get('b')!({ status: 'queued' }));
  act(() => observers.get('a')!(undefined));
  expect(active()).toBe(false);
  act(() => observers.get('b')!(undefined));
  expect(active()).toBe(false);
  act(() => renderer!.unmount());
  expect(observers.size).toBe(0);
});

test('a changed key never shows the previous file’s progress', () => {
  const seen: (PdfOcrState | undefined)[] = [];
  function StateProbe({ id }: { id: string }) {
    seen.push(usePdfOcrState(id));
    return null;
  }
  const tree = (id: string) => (
    <BackendProvider backend={{ file } as unknown as Backend}>
      <StateProbe id={id} />
    </BackendProvider>
  );
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(tree('a'));
  });
  act(() => observers.get('a')!({ status: 'recognizing', completedPages: 2, totalPages: 5 }));
  expect(seen.at(-1)).toEqual({ status: 'recognizing', completedPages: 2, totalPages: 5 });
  seen.length = 0;
  act(() => renderer!.update(tree('b')));
  expect(seen).not.toContainEqual(expect.objectContaining({ status: 'recognizing' }));
  act(() => renderer!.unmount());
  expect(observers.size).toBe(0);
});
