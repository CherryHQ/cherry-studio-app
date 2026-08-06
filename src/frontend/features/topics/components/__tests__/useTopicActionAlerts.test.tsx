import type { Topic } from '@cherrystudio/universal/data/types/topic';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useAppAlert } from '@/frontend/components/AppAlertProvider';

import { useTopicListActions } from '../../context/TopicListProvider';
import { useTopicActionAlerts } from '../useTopicActionAlerts';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/components/AppAlertProvider', () => ({
  useAppAlert: jest.fn(),
}));

jest.mock('../../context/TopicListProvider', () => ({
  useTopicListActions: jest.fn(),
}));

const mockShowConfirmation = jest.fn();
const mockShowMessage = jest.fn();
const mockShowPrompt = jest.fn();
const mockDeleteTopic = jest.fn(async () => undefined);
const mockRenameTopic = jest.fn(async () => undefined);
const useAppAlertMock = useAppAlert as jest.MockedFunction<typeof useAppAlert>;
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
    useAppAlertMock.mockReturnValue({
      showConfirmation: mockShowConfirmation,
      showMessage: mockShowMessage,
      showPrompt: mockShowPrompt,
    });
    useTopicListActionsMock.mockReturnValue({
      deleteTopic: mockDeleteTopic,
      deleteTopics: jest.fn(),
      loadMoreTopics: jest.fn(),
      openTopic: jest.fn(),
      renameTopic: mockRenameTopic,
      toggleTopicPin: jest.fn(),
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

    expect(mockShowPrompt).toHaveBeenCalledWith(
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

    const prompt = mockShowPrompt.mock.calls[0][0];
    act(() => prompt.onConfirm('  Renamed topic  '));
    await act(async () => Promise.resolve());
    expect(mockRenameTopic).toHaveBeenCalledWith('topic-1', 'Renamed topic');
  });

  test('shows an Alert after a failed optimistic rename', async () => {
    mockRenameTopic.mockRejectedValueOnce(new Error('rename failed'));
    act(() => actions?.requestRename(topic));

    const prompt = mockShowPrompt.mock.calls[0][0];
    act(() => prompt.onConfirm('Renamed topic'));
    await act(async () => Promise.resolve());

    expect(mockShowMessage).toHaveBeenCalledWith({ title: 'topic.rename.failed' });
  });
});
