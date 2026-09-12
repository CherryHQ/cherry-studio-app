import { splitToolMentions, toolMentions } from '../toolMentions';

describe('splitToolMentions', () => {
  it('returns nothing for empty text', () => {
    expect(splitToolMentions('')).toEqual([]);
  });

  it('leaves text without a mention in one plain run', () => {
    expect(splitToolMentions('draw a cat')).toEqual([{ text: 'draw a cat' }]);
  });

  it('has no registered tool mentions', () => {
    expect(toolMentions).toEqual([]);
  });

  it('leaves the retired image-generation mention as plain text', () => {
    const text = 'please [Create image](tool://create-image) a cat';

    expect(splitToolMentions(text)).toEqual([{ text }]);
  });

  it('leaves the retired web-search mention as plain text', () => {
    const text = '[Web search](tool://web-search) Cherry Studio';

    expect(splitToolMentions(text)).toEqual([{ text }]);
  });

  // The old form was `@name`, which meant prose containing the words lit up as
  // a mention. Nothing but a link counts now.
  it('leaves prose that merely names the tool alone', () => {
    expect(splitToolMentions('用 @创建图片 帮我画')).toEqual([{ text: '用 @创建图片 帮我画' }]);
  });

  it('leaves a link to an unknown tool as plain text', () => {
    expect(splitToolMentions('[Summarize](tool://summarize)')).toEqual([
      { text: '[Summarize](tool://summarize)' },
    ]);
  });

  it('leaves an ordinary markdown link alone', () => {
    expect(splitToolMentions('see [the docs](https://example.com)')).toEqual([
      { text: 'see [the docs](https://example.com)' },
    ]);
  });

  it('keeps surrounding markdown verbatim when no mention is registered', () => {
    const text = '**bold** [创建图片](tool://create-image) `code`';

    expect(splitToolMentions(text)).toEqual([{ text }]);
  });
});
