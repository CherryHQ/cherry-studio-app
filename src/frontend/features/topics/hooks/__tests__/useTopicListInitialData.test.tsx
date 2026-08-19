import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  areTopicListQueriesSettled,
  type TopicListQuery,
  useTopicListInitialData,
} from '../useTopicListInitialData';

type Options = Parameters<typeof useTopicListInitialData>[0];

const settledQuery: TopicListQuery = { isLoading: false };
const loadingQuery: TopicListQuery = { isLoading: true };

function renderInitialData(options: Options) {
  let current: boolean | undefined;
  let renderer: ReactTestRenderer | undefined;

  function Probe(props: Options) {
    current = useTopicListInitialData(props);
    return null;
  }

  act(() => {
    renderer = create(<Probe {...options} />);
  });

  return {
    get current() {
      if (current === undefined) {
        throw new Error('The topic-list initial-data hook did not render');
      }
      return current;
    },
    rerender(next: Options) {
      act(() => renderer?.update(<Probe {...next} />));
    },
    unmount() {
      act(() => renderer?.unmount());
    },
  };
}

describe('topic-list query settlement', () => {
  test('waits while any of topics, pins, or assistants is incomplete', () => {
    expect(
      areTopicListQueriesSettled({
        assistants: settledQuery,
        pins: loadingQuery,
        topics: settledQuery,
      }),
    ).toBe(false);
  });

  test('treats a successful empty result as settled', () => {
    expect(
      areTopicListQueriesSettled({
        assistants: settledQuery,
        pins: settledQuery,
        topics: settledQuery,
      }),
    ).toBe(true);
  });

  test('treats query errors as settled instead of hiding the list forever', () => {
    const failedQuery = { error: new Error('query failed'), isLoading: false };
    expect(
      areTopicListQueriesSettled({
        assistants: failedQuery,
        pins: failedQuery,
        topics: failedQuery,
      }),
    ).toBe(true);
  });
});

describe('useTopicListInitialData', () => {
  test('mounts list content only after all initial queries settle and never closes it again', () => {
    const initialData = renderInitialData({
      assistants: settledQuery,
      pins: loadingQuery,
      topics: settledQuery,
    });
    expect(initialData.current).toBe(false);

    initialData.rerender({
      assistants: settledQuery,
      pins: settledQuery,
      topics: settledQuery,
    });
    expect(initialData.current).toBe(true);

    initialData.rerender({
      assistants: settledQuery,
      pins: loadingQuery,
      topics: settledQuery,
    });
    expect(initialData.current).toBe(true);
    initialData.unmount();
  });
});
