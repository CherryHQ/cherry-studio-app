import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useExclusiveSwipeable } from '../useExclusiveSwipeable';

type Swipeable = { close: jest.Mock };

function createSwipeable(): Swipeable {
  return { close: jest.fn() };
}

let hook: ReturnType<typeof useExclusiveSwipeable> | undefined;
let renderer: ReactTestRenderer | undefined;

function Probe() {
  const current = useExclusiveSwipeable();

  useEffect(() => {
    hook = current;
  }, [current]);

  return null;
}

describe('useExclusiveSwipeable', () => {
  beforeEach(async () => {
    hook = undefined;
    await act(async () => {
      renderer = create(<Probe />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('closes the previously open swipeable when another one starts opening', () => {
    const rowA = createSwipeable();
    const rowB = createSwipeable();

    hook?.notifyWillOpen(rowA as never);
    expect(rowA.close).not.toHaveBeenCalled();

    hook?.notifyWillOpen(rowB as never);
    expect(rowA.close).toHaveBeenCalledTimes(1);
    expect(rowB.close).not.toHaveBeenCalled();
  });

  it('does not close the same row it is already tracking as open', () => {
    const row = createSwipeable();

    hook?.notifyWillOpen(row as never);
    hook?.notifyWillOpen(row as never);

    expect(row.close).not.toHaveBeenCalled();
  });

  it('closes and forgets the tracked row on demand', () => {
    const row = createSwipeable();

    hook?.notifyWillOpen(row as never);
    hook?.closeOpen();
    hook?.notifyWillOpen(row as never);

    expect(row.close).toHaveBeenCalledTimes(1);
  });

  it('forgets a row once it reports closing, so a later open of it does not self-close', () => {
    const row = createSwipeable();

    hook?.notifyWillOpen(row as never);
    hook?.notifyClose(row as never);
    hook?.notifyWillOpen(row as never);

    expect(row.close).not.toHaveBeenCalled();
  });

  it('ignores a close notification from a row that is not the tracked open one', () => {
    const rowA = createSwipeable();
    const rowB = createSwipeable();

    hook?.notifyWillOpen(rowA as never);
    hook?.notifyWillOpen(rowB as never);
    hook?.notifyClose(rowA as never);
    hook?.notifyWillOpen(rowB as never);

    expect(rowB.close).not.toHaveBeenCalled();
  });
});
