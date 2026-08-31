import { splitToolMentions } from '../toolMentions';

describe('splitToolMentions', () => {
  it('returns nothing for empty text', () => {
    expect(splitToolMentions('')).toEqual([]);
  });

  it('leaves text without a mention in one plain run', () => {
    expect(splitToolMentions('draw a cat')).toEqual([{ text: 'draw a cat' }]);
  });

  it('splits a mention out of the surrounding text', () => {
    expect(splitToolMentions('please [Create image](tool://create-image) a cat')).toEqual([
      { text: 'please ' },
      { id: 'create-image', text: 'Create image' },
      { text: ' a cat' },
    ]);
  });

  it('handles a mention at the start and at the end', () => {
    expect(
      splitToolMentions('[创建图片](tool://create-image) 一只猫 [创建图片](tool://create-image)'),
    ).toEqual([
      { id: 'create-image', text: '创建图片' },
      { text: ' 一只猫 ' },
      { id: 'create-image', text: '创建图片' },
    ]);
  });

  // The id is in the URL, so the language the message was written in stops
  // mattering the moment it is read back.
  it('reads the same tool out of any language it was written in', () => {
    expect(
      splitToolMentions('[创建图片](tool://create-image) and [Create image](tool://create-image)'),
    ).toEqual([
      { id: 'create-image', text: '创建图片' },
      { text: ' and ' },
      { id: 'create-image', text: 'Create image' },
    ]);
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

  it('keeps the markdown the user typed verbatim around a mention', () => {
    expect(splitToolMentions('**bold** [创建图片](tool://create-image) `code`')).toEqual([
      { text: '**bold** ' },
      { id: 'create-image', text: '创建图片' },
      { text: ' `code`' },
    ]);
  });
});
