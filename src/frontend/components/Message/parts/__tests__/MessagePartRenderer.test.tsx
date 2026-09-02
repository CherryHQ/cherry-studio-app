import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { MessagePartRenderer } from '../MessagePartRenderer';

jest.mock('../CodePart', () => ({ CodePart: () => null }));
jest.mock('../CompactPart', () => ({ CompactPart: () => null }));
jest.mock('../ErrorPart', () => ({ ErrorPart: () => null }));
jest.mock('../FilePart', () => ({ FilePart: () => null }));
jest.mock('../ReasoningPart', () => ({ ReasoningPart: () => null }));
jest.mock('../SourceUrlPart', () => ({ SourceUrlPart: () => null }));
jest.mock('../TextPart', () => ({ TextPart: () => null }));
jest.mock('../tools/ToolPartRenderer', () => ({ ToolPartRenderer: () => null }));
jest.mock('../TranslationPart', () => ({ TranslationPart: () => null }));
jest.mock('../UnknownPart', () => ({ UnknownPart: () => null }));

describe('MessagePartRenderer', () => {
  test.each([
    {
      filename: 'reference.pdf',
      mediaType: 'application/pdf',
      sourceId: 'source-1',
      title: 'Reference',
      type: 'source-document',
    },
    {
      data: { duration: 10, url: 'https://example.com/video.mp4' },
      type: 'data-video',
    },
  ] as CherryMessagePart[])('does not render unsupported $type parts', (part) => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(
        <MessagePartRenderer isStreaming={false} isTextSelectionEnabled part={part} />,
      );
    });

    expect(renderer?.toJSON()).toBeNull();
  });
});
