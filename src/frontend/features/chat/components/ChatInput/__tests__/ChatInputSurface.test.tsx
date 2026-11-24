import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatInputSurface } from '../ChatInputSurface';
import { deriveContextUsage } from '../utils/contextUsage';

let mockEditing = false;
let mockDraft = '';
let mockAttachments: { status: 'importing' }[] = [];
const mockStop = jest.fn();
const mockSubmit = jest.fn();
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));
jest.mock('@/frontend/data/hooks', () => ({ usePreference: () => [false] }));
jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const component = (name: string) =>
    function MockComponent({ children, ...props }: any) {
      return React.createElement(name, props, children);
    };
  return {
    Composer: {
      Editor: component('Editor'),
      Send: component('Send'),
      Action: component('Action'),
      EditorSecondary: component('Secondary'),
    },
  };
});
jest.mock('@/frontend/components/Composer/context/ComposerProvider', () => ({
  useComposerPresentationState: () => ({ isEditing: mockEditing, keyboardVisible: mockKeyboard }),
}));
jest.mock('@/frontend/components/Composer/components/ComposerField', () => ({
  ComposerField: () => null,
}));
const mockKeyboard = { get: () => mockEditing };
jest.mock('@/frontend/components/Composer', () => ({
  ...jest.requireActual('@/frontend/components/Composer/components/ComposerEditor'),
  ComposerSurface: ({ children }: any) => children,
  useComposerPresentationState: () => ({ isEditing: mockEditing }),
  useComposerState: () => ({ draft: mockDraft, attachments: mockAttachments }),
  useComposerSubmit: () => mockSubmit,
}));
jest.mock('../components/ContextUsageRing', () => {
  const React = jest.requireActual('react');
  return {
    ContextUsageRing: function MockRing(props: object) {
      const [open, setOpen] = React.useState(false);
      return React.createElement('Ring', { ...props, open, onPress: () => setOpen(true) });
    },
  };
});
jest.mock('../../../voice/DictationCancelAction', () => ({ DictationCancelAction: () => null }));
jest.mock('../../../voice/DictationStatus', () => ({ DictationStatus: () => null }));
jest.mock('../../../voice/useDictation', () => ({ useDictation: () => ({ state: 'idle' }) }));
jest.mock('../../../voice/useDictationAvailability', () => ({
  useDictationAvailability: () => true,
}));
jest.mock('../../../voice/ChatInputPrimaryAction', () => ({
  ChatInputPrimaryAction: ({ send }: any) =>
    jest.requireActual('react').createElement('Dictation', null, send),
}));

describe('ChatInputSurface', () => {
  let renderer: ReactTestRenderer;
  const usage = deriveContextUsage(100, 20)!;
  const render = (message = 'm') => (
    <ChatInputSurface
      contextUsage={usage}
      contextUsageSessionId="s"
      contextUsageMessageId={message}
      streaming
      onStop={mockStop}
      dictation
    />
  );
  const ring = () => renderer.root.findByType('Ring' as never);
  const hasRingInsideSecondary = () =>
    renderer.root
      .findAllByType('Secondary' as never)
      .some((node) => node.findAllByType('Ring' as never).length === 1);
  beforeEach(() => {
    mockEditing = false;
    mockDraft = '';
    mockAttachments = [];
  });
  afterEach(() => act(() => renderer.unmount()));
  test('keeps one right-side trigger inside secondary actions and preserves its open state while editing changes', () => {
    act(() => {
      renderer = create(render());
    });
    expect(renderer.root.findByType('Editor' as never).props.restingTrailingActionCount).toBe(1);
    expect(hasRingInsideSecondary()).toBe(true);
    expect(ring().props.testID).toBe('chat-context-usage-compact');
    act(() => ring().props.onPress());
    expect(ring().props.open).toBe(true);
    mockEditing = true;
    mockDraft = 'draft';
    act(() => renderer.update(render()));
    expect(hasRingInsideSecondary()).toBe(true);
    expect(ring().props.testID).toBe('chat-context-usage-editing');
    expect(renderer.root.findAllByType('Ring' as never)).toHaveLength(1);
    expect(ring().props.open).toBe(true);
    expect(renderer.root.findByProps({ testID: 'chat-composer-stop' }).props.onPress).toBe(
      mockStop,
    );
    expect(renderer.root.findByProps({ testID: 'chat-composer-send' })).toBeTruthy();
    expect(renderer.root.findAllByType('Dictation' as never)).toHaveLength(1);
    act(() =>
      renderer.root.findByType('Editor' as never).props.field.props.onReturnSubmit('draft'),
    );
    expect(mockSubmit).toHaveBeenCalledWith('draft');
  });
  test('keeps restored text and a staged attachment compact until the chat keyboard opens', () => {
    mockDraft = 'one\ntwo\nthree';
    mockAttachments = [{ status: 'importing' }];
    const frame = () => renderer.root.findByType('Editor' as never).props;
    act(() => {
      renderer = create(render());
    });
    expect(frame().active).toBe(false);
    expect(frame().activeSignal.get()).toBe(false);
    mockEditing = true;
    act(() => renderer.update(render()));
    expect(frame().active).toBe(true);
    mockEditing = false;
    act(() => renderer.update(render()));
    expect(frame().active).toBe(false);
    expect(frame().activeSignal.get()).toBe(false);
  });
  test('closes the old measurement when its owner changes, including returning to the old owner', () => {
    act(() => {
      renderer = create(render());
    });
    act(() => ring().props.onPress());
    act(() => renderer.update(render('other')));
    act(() => renderer.update(render()));
    expect(ring().props.open).toBe(false);
    act(() => ring().props.onPress());
    expect(ring().props.open).toBe(true);
    act(() => renderer.update(render('other')));
    expect(ring().props.open).toBe(false);
  });
});
