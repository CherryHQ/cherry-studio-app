import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useToolGroupActivity } from '../useToolGroupActivity';

function Activity({ activity, running = true }: { activity: string; running?: boolean }) {
  const visibleActivity = useToolGroupActivity(activity, running);
  return <Text>{visibleActivity}</Text>;
}

describe('useToolGroupActivity', () => {
  let renderer: ReactTestRenderer;
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    act(() => renderer.unmount());
    jest.useRealTimers();
  });

  it('coalesces rapid calls to the latest activity without flashing each intermediate label', () => {
    act(() => {
      renderer = create(<Activity activity="Read" />);
    });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    act(() => renderer.update(<Activity activity="Search" />));
    expect(renderer.root.findByType(Text).props.children).toBe('Read');
    act(() => {
      jest.advanceTimersByTime(300);
    });
    act(() => renderer.update(<Activity activity="Edit" />));
    act(() => {
      jest.advanceTimersByTime(599);
    });
    expect(renderer.root.findByType(Text).props.children).toBe('Read');
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(renderer.root.findByType(Text).props.children).toBe('Edit');
  });

  it('shows urgent or settled labels immediately and never replays a pending activity', () => {
    act(() => {
      renderer = create(<Activity activity="Read" />);
    });
    act(() => renderer.update(<Activity activity="Search" />));
    act(() => renderer.update(<Activity activity="Approval required" running={false} />));
    expect(renderer.root.findByType(Text).props.children).toBe('Approval required');
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(renderer.root.findByType(Text).props.children).toBe('Approval required');
    act(() => renderer.unmount());
    expect(jest.getTimerCount()).toBe(0);
  });
});
