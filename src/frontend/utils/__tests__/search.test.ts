import { matchesSearchKeywords, toSearchKeywords } from '../search';

describe('toSearchKeywords', () => {
  it('splits on whitespace and lowercases', () => {
    expect(toSearchKeywords('GPT 4o')).toEqual(['gpt', '4o']);
  });

  it('drops padding and collapses runs of whitespace', () => {
    expect(toSearchKeywords('  qwen   vision  ')).toEqual(['qwen', 'vision']);
  });

  it('returns nothing for a whitespace-only query', () => {
    expect(toSearchKeywords('   ')).toEqual([]);
  });
});

describe('matchesSearchKeywords', () => {
  it('matches when every keyword appears', () => {
    expect(matchesSearchKeywords(['gpt', '4o'], ['GPT-4o', 'OpenAI'])).toBe(true);
  });

  it('rejects when one keyword is missing', () => {
    expect(matchesSearchKeywords(['gpt', 'sonnet'], ['GPT-4o', 'OpenAI'])).toBe(false);
  });

  it('lets one query span several fields', () => {
    expect(matchesSearchKeywords(['qwen', 'vision'], ['Qwen', 'A vision model'])).toBe(true);
  });

  it('ignores absent fields rather than matching against them', () => {
    expect(matchesSearchKeywords(['qwen'], ['Qwen', null, undefined])).toBe(true);
    expect(matchesSearchKeywords(['null'], ['Qwen', null, undefined])).toBe(false);
  });

  it('treats an empty keyword list as no filter', () => {
    expect(matchesSearchKeywords([], ['anything'])).toBe(true);
  });
});
