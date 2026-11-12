import { createRef, type Ref, useImperativeHandle } from 'react';
import { act, create } from 'react-test-renderer';

import {
  ChatEditingProvider,
  type ChatEditingTarget,
  useChatEditing,
} from '../ChatEditingProvider';

type ProbeHandle = ReturnType<typeof useChatEditing>;

function Probe({ ref }: { ref: Ref<ProbeHandle> }) {
  const value = useChatEditing();
  useImperativeHandle(ref, () => value, [value]);
  return null;
}

describe('ChatEditingProvider', () => {
  test('carries the editing session between the transcript and the composer', () => {
    const probeRef = createRef<ProbeHandle>();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <ChatEditingProvider>
          <Probe ref={probeRef} />
        </ChatEditingProvider>,
      );
    });

    const target: ChatEditingTarget = { messageId: 'user-1', initialText: 'Question' };
    expect(probeRef.current?.editing).toBeNull();

    act(() => probeRef.current?.beginEdit(target));
    expect(probeRef.current?.editing).toEqual(target);

    act(() => probeRef.current?.endEdit());
    expect(probeRef.current?.editing).toBeNull();

    act(() => renderer.unmount());
  });
});
