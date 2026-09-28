import { type ReactNode, useLayoutEffect, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useFieldText } from '../use-field-text';

let renderer: ReactTestRenderer | undefined;
let nativeWrites: string[] = [];
const harness = {
  deliver: (_children: ReactNode): void => {
    throw new Error('No portal host');
  },
  typeNative: (_text: string): void => {
    throw new Error('No native input');
  },
};
const detached = { ...harness };

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  nativeWrites = [];
  Object.assign(harness, detached);
});

// React Native's TextInput sync: it records the text native reported and, after
// each commit, writes `value` back into the native field when the two differ.
function NativeInput({
  onChangeText,
  value,
}: {
  onChangeText: (text: string) => void;
  value: string;
}) {
  const [lastNativeText, setLastNativeText] = useState(value);

  useLayoutEffect(() => {
    if (lastNativeText !== value) {
      nativeWrites.push(value);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors React Native's TextInput
      setLastNativeText(value);
    }
  }, [lastNativeText, value]);

  useLayoutEffect(() => {
    harness.typeNative = (text) => {
      onChangeText(text);
      setLastNativeText(text);
    };
  });

  return null;
}

function Field({ onChangeText, value }: { onChangeText: (text: string) => void; value: string }) {
  const [text, changeText] = useFieldText(value, onChangeText);

  return <NativeInput onChangeText={changeText} value={text} />;
}

// Hands its children to a host elsewhere in the tree from a layout effect, as
// the bottom sheet's portal does, so the field sees a new value a commit late.
function PortalHost() {
  const [children, setChildren] = useState<ReactNode>(null);

  useLayoutEffect(() => {
    harness.deliver = setChildren;
  }, []);
  return children;
}

function Portal({ children }: { children: ReactNode }) {
  useLayoutEffect(() => harness.deliver(children), [children]);
  return null;
}

function Owner({ rewrite, sheet }: { rewrite?: (text: string) => string; sheet: boolean }) {
  const [value, setValue] = useState('12');
  const field = <Field onChangeText={(text) => setValue(rewrite?.(text) ?? text)} value={value} />;

  return sheet ? (
    <>
      <PortalHost />
      <Portal>{field}</Portal>
    </>
  ) : (
    field
  );
}

async function type(text: string) {
  await act(async () => harness.typeNative(text));
}

describe('useFieldText', () => {
  test.each([false, true])('leaves native text alone while typing (sheet: %s)', async (sheet) => {
    act(() => {
      renderer = create(<Owner sheet={sheet} />);
    });

    await type('123');
    await type('1234');

    expect(nativeWrites).toEqual([]);
  });

  test.each([false, true])('writes back the value a caller keeps (sheet: %s)', async (sheet) => {
    act(() => {
      renderer = create(<Owner rewrite={(text) => text.replaceAll(/\D/g, '')} sheet={sheet} />);
    });

    await type('12a');

    expect(nativeWrites).toEqual(['12']);
  });

  test.each([false, true])('writes the value a caller rewrites into (sheet: %s)', async (sheet) => {
    act(() => {
      renderer = create(<Owner rewrite={(text) => text.toUpperCase()} sheet={sheet} />);
    });

    await type('12a');

    expect(nativeWrites).toEqual(['12A']);
  });

  test('writes a value the caller pushes', () => {
    const onChangeText = jest.fn();

    act(() => {
      renderer = create(<Field onChangeText={onChangeText} value="draft" />);
    });
    act(() => renderer!.update(<Field onChangeText={onChangeText} value="" />));

    expect(nativeWrites).toEqual(['']);
  });
});
