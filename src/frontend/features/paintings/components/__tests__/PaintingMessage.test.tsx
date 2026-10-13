import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createPaintingMessages } from '../../utils/paintingMessages';
import { PaintingMessage, type PaintingMessageState } from '../PaintingMessage';

const mockOpenFile = jest.fn();
const mockFile = {
  entry: { id: '00000000-0000-7000-8000-000000000002', filename: 'source.jpg' },
  uri: 'file:///source.jpg',
};
jest.mock('@/frontend/components/FileEntryPreview', () => ({
  PreviewImage: () => null,
  useResolvedFile: () => ({ data: mockFile }),
  useOpenFileEntry: () => ({ openFileEntry: mockOpenFile }),
}));
jest.mock('@/frontend/components/ArtifactPreview', () => ({ ArtifactPreviewLink: () => null }));
jest.mock('../PaintingAssistantMessage', () => ({ PaintingAssistantMessage: () => null }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@cherrystudio/ui/components', () => ({
  BackgroundPressExclusion: ({ children }: { children: React.ReactNode }) => children,
}));

it('opens the original reference from a submitted painting turn', () => {
  const [message] = createPaintingMessages({
    assistantMessageId: 'result',
    assistantStatus: 'success',
    userMessageId: 'request',
    prompt: 'Make the cup blue',
    attachments: [
      {
        id: 'photo',
        fileEntryId: mockFile.entry.id,
        kind: 'image',
        mediaType: 'image/jpeg',
        name: 'source.jpg',
        status: 'ready',
        uri: mockFile.uri,
      },
    ],
  });
  const state: PaintingMessageState = {
    aspectRatio: 1,
    error: null,
    interruption: null,
    outputs: [],
    prompt: '',
    resolution: '',
    status: 'idle',
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<PaintingMessage message={message} state={state} />);
  });
  const preview = renderer.root.findAll(
    (node) =>
      node.props.accessibilityRole === 'button' &&
      node.props.accessibilityLabel === 'source.jpg' &&
      typeof node.props.onPress === 'function',
  )[0];
  expect(preview.props.accessibilityLabel).toBe('source.jpg');
  act(() => preview.props.onPress());
  expect(mockOpenFile).toHaveBeenCalledWith(mockFile);
  act(() => renderer.unmount());
});
