import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { type ReactNode, useEffect } from 'react';
import { Keyboard, Pressable } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  ComposerProvider,
  useComposerMeta,
  useComposerPresentationActions,
  useComposerPresentationState,
} from '../../context/ComposerProvider';
import { ComposerModelPill } from '../ComposerModelPill';

jest.mock('@cherrystudio/ui/components', () => {
  const { Pressable } = jest.requireActual('react-native');
  return {
    Composer: {
      Pill: (props: { children: ReactNode; onPress: () => void }) => <Pressable {...props} />,
    },
  };
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockBlur = jest.fn();
const mockFocus = jest.fn();
let presentation: ReturnType<typeof useComposerPresentationState>;

function FieldProbe({ editing }: { editing: boolean }) {
  const { inputRef } = useComposerMeta();
  const { activateInput } = useComposerPresentationActions();
  const state = useComposerPresentationState();
  useEffect(() => {
    inputRef.current = { blur: mockBlur, focus: mockFocus } as unknown as ComposerInputHandle;
    if (editing) activateInput();
    return () => {
      inputRef.current = null;
    };
  }, [activateInput, editing, inputRef]);
  useEffect(() => {
    presentation = state;
  }, [state]);
  return null;
}

describe('ComposerModelPill', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test.each([
    { editing: false, label: undefined },
    { editing: true, label: 'Selected model' },
  ])('opens the picker without replacing input when editing=$editing', ({ editing, label }) => {
    const open = jest.fn();
    jest.spyOn(Keyboard, 'dismiss');
    act(() => {
      renderer = create(
        <ComposerProvider>
          <FieldProbe editing={editing} />
          <ComposerModelPill label={label} onPress={open} />
        </ComposerProvider>,
      );
    });

    act(() => renderer!.root.findByType(Pressable).props.onPress());

    expect(open).toHaveBeenCalledTimes(1);
    expect(presentation).toEqual({ isEditing: editing, isKeyboardTrackingEnabled: true });
    expect(mockBlur).not.toHaveBeenCalled();
    expect(mockFocus).not.toHaveBeenCalled();
    expect(Keyboard.dismiss).not.toHaveBeenCalled();
    expect(KeyboardController.dismiss).not.toHaveBeenCalled();
  });
});
