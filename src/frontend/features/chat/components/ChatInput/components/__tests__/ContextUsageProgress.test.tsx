import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { deriveContextUsage } from '../../utils/contextUsage';
import { ContextUsageProgress } from '../ContextUsageProgress';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { value: string }) =>
      key === 'chat.contextUsage.capacityShort' ? `${values?.value} k token` : key,
    i18n: { language: 'en-US' },
  }),
}));

test('reports raw over-capacity percentages while clamping the drawn progress', () => {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(<ContextUsageProgress usage={deriveContextUsage(200_000, 220_000)!} />);
  });
  expect(renderer!.root.findAllByType(Text).map((text) => text.props.children)).toEqual([
    '110%',
    '200 k token',
  ]);
  const meter = renderer!.root.findByProps({ testID: 'chat-context-usage-progress' });
  expect(meter.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100, text: '110%' });
  expect(meter.findAllByType(View).find((view) => view.props.style)?.props.style.width).toBe(
    '100%',
  );
  act(() => renderer!.update(<ContextUsageProgress usage={deriveContextUsage(200_000)!} />));
  expect(renderer!.root.findAllByType(Text)[0]?.props.children).toBe('—');
  expect(
    renderer!.root.findByProps({ testID: 'chat-context-usage-progress' }).props.accessibilityValue,
  ).toEqual({ text: 'chat.messageUsage.unavailable' });
  act(() => renderer!.unmount());
});
