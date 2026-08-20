import { useAlert } from '@cherrystudio/ui/components';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Topic } from '@/shared/data/types/topic';

import { useTopicListActions } from '../../context/TopicListProvider';
import { useTopicActionAlerts } from '../useTopicActionAlerts';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: jest.fn(),
}));

jest.mock('../../context/TopicListProvider', () => ({
  useTopicListActions: jest.fn(),
}));

const mockAlertConfirm = jest.fn();
const mockAlertShow = jest.fn();
const mockAlertPrompt = jest.fn();
const mockDeleteTopic = jest.fn(async () => undefined);
const mockRenameTopic = jest.fn(async () => undefined);
const useAlertMock = useAlert as jest.MockedFunction<typeof useAlert>;
const useTopicListActionsMock = useTopicListActions as jest.MockedFunction<
  typeof useTopicListActions
>;

let actions: ReturnType<typeof useTopicActionAlerts> | undefined;
let renderer: ReactTestRenderer | undefined;

function Probe() {
  const currentActions = useTopicActionAlerts();

  useEffect(() => {
    actions = currentActions;
  }, [currentActions]);

  return null;
}

const topic = {
  id: 'topic-1',
  name: 'Original topic',
} as Topic;

describe('useTopicActionAlerts', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    actions = undefined;
    useAlertMock.mockReturnValue({
      alert: {
        confirm: mockAlertConfirm,
        prompt: mockAlertPrompt,
        show: mockAlertShow,
      },
    });
    useTopicListActionsMock.mockReturnValue({
      deleteTopic: mockDeleteTopic,
      deleteTopics: jest.fn(),
      loadMoreTopics: jest.fn(),
      renameTopic: mockRenameTopic,
    });

    await act(async () => {
      renderer = create(<Probe />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  test('requests a native prompt and renames with its trimmed value', async () => {
    act(() => actions?.requestRename(topic));

    expect(mockAlertPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'common.save',
        input: {
          accessibilityLabel: 'topic.renameTitle',
          autoFocus: true,
          initialValue: 'Original topic',
          maxLength: 255,
          placeholder: 'topic.rename.placeholder',
        },
        title: 'topic.renameTitle',
      }),
    );

    const prompt = mockAlertPrompt.mock.calls[0][0];
    act(() => prompt.onConfirm('  Renamed topic  '));
    await act(async () => Promise.resolve());
    expect(mockRenameTopic).toHaveBeenCalledWith('topic-1', 'Renamed topic');
  });

  test('shows an Alert after a failed optimistic rename', async () => {
    mockRenameTopic.mockRejectedValueOnce(new Error('rename failed'));
    act(() => actions?.requestRename(topic));

    const prompt = mockAlertPrompt.mock.calls[0][0];
    act(() => prompt.onConfirm('Renamed topic'));
    await act(async () => Promise.resolve());

    expect(mockAlertShow).toHaveBeenCalledWith({ title: 'topic.rename.failed' });
  });
});
