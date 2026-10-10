import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AgentAvatar } from '../components/AgentAvatar';

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  return {
    Avatar: Object.assign((props: object) => React.createElement('avatar', props), {
      Image: (props: object) => React.createElement('avatar-image', props),
      Fallback: (props: object) => React.createElement('avatar-fallback', props),
    }),
  };
});
let tree: ReactTestRenderer;
afterEach(() => act(() => tree?.unmount()));

test('renders the full desktop emoji rather than the Agent name initial', () => {
  act(() => {
    tree = create(<AgentAvatar name="Developer" emoji=" 🧑🏽‍💻 " size={28} />);
  });
  expect(tree.root.findByType('avatar-fallback' as never).props.children).toBe('🧑🏽‍💻');
});
test.each([
  { expected: 'D', props: { name: 'developer' } },
  { expected: '周', props: { name: ' 周报助手' } },
  { expected: '', props: { name: '', emoji: '   ' } },
  { expected: 'D', props: { name: 'Developer', avatar: 'managed-file-id' } },
])(
  'falls back to the name initial, never a managed file reference: $props',
  ({ expected, props }) => {
    act(() => {
      tree = create(<AgentAvatar {...props} />);
    });
    expect(tree.root.findByType('avatar-fallback' as never).props.children).toBe(expected);
  },
);
test('resolved image takes precedence over emoji while local Cherry emoji still renders', () => {
  act(() => {
    tree = create(<AgentAvatar name="Developer" avatar="🍒" />);
  });
  expect(tree.root.findByType('avatar-fallback' as never).props.children).toBe('🍒');
  act(() => tree.update(<AgentAvatar name="Developer" emoji="🤖" uri="file:///avatar.png" />));
  expect(tree.root.findAllByType('avatar-image' as never)).toHaveLength(1);
  expect(tree.root.findAllByType('avatar-fallback' as never)).toHaveLength(0);
});
