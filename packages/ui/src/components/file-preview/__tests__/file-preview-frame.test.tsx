import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('uniwind', () => ({
  ...jest.requireActual('uniwind'),
  useCSSVariable: () => ['#2288aa', '#cc3344'],
}));

import { FilePreviewFrame } from '../components/file-preview-frame';

it('announces acknowledged upload progress and removes the busy state when the file is ready', () => {
  let renderer: ReactTestRenderer;
  const props = { accessibilityLabel: 'report.pdf', onPress: jest.fn(), size: 112 };
  act(() => {
    renderer = create(
      <FilePreviewFrame
        {...props}
        transfer={{ state: 'uploading', progress: 0.25, label: 'Uploading 25%' }}
      >
        {null}
      </FilePreviewFrame>,
    );
  });
  expect(
    renderer!.root.findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue,
  ).toEqual({ min: 0, max: 100, now: 25 });
  expect(
    renderer!.root.findAllByProps({ accessibilityRole: 'button' })[0].props.accessibilityState.busy,
  ).toBe(true);
  act(() => {
    renderer!.update(<FilePreviewFrame {...props}>{null}</FilePreviewFrame>);
  });
  expect(renderer!.root.findAllByProps({ accessibilityRole: 'progressbar' })).toHaveLength(0);
  expect(
    renderer!.root.findAllByProps({ accessibilityRole: 'button' })[0].props.accessibilityState.busy,
  ).toBe(false);
  act(() => renderer!.unmount());
});
