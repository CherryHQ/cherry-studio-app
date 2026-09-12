import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SourceLink } from '../SourceLink';

const mockOpenExternalUrl = jest.fn(async (_url: string) => undefined);

jest.mock('@/frontend/utils/openExternalUrl', () => ({
  openExternalUrl: (url: string) => mockOpenExternalUrl(url),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');

  return {
    MessagePart: {
      Source: (props: object) => createElement('MessagePartSource', props),
    },
  };
});

describe('SourceLink', () => {
  it('opens its source URL through the application link handler', () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(<SourceLink label="Cherry Studio" url="https://cherry-ai.com" />);
    });

    act(() => {
      renderer?.root.findByType('MessagePartSource').props.onPress('https://cherry-ai.com');
    });

    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://cherry-ai.com');
  });
});
