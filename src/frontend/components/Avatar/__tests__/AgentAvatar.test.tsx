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
  { name: 'Developer' },
  { name: '', emoji: '   ' },
  { name: 'Developer', avatar: 'managed-file-id' },
])('uses the robot default without displaying initials or managed file references: %j', (props) => {
  act(() => {
    tree = create(<AgentAvatar {...props} />);
  });
  expect(tree.root.findByType('avatar-fallback' as never).props.children).toBe('🤖');
});
test('resolved image takes precedence over emoji while local Cherry emoji still renders', () => {
  act(() => {
    tree = create(<AgentAvatar name="Developer" avatar="🍒" />);
  });
  expect(tree.root.findByType('avatar-fallback' as never).props.children).toBe('🍒');
  act(() => tree.update(<AgentAvatar name="Developer" emoji="🤖" uri="file:///avatar.png" />));
  expect(tree.root.findAllByType('avatar-image' as never)).toHaveLength(1);
  expect(tree.root.findAllByType('avatar-fallback' as never)).toHaveLength(0);
});
