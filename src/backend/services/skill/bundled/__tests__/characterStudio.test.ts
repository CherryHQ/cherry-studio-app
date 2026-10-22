import { getCharacterStudioInstructions } from '../characterStudio';

const tools = (names: string[]) => new Map(names.map((name) => [name, name]));
const all = ['generate_image', 'image_process', 'avatar_character_save', 'agent_set_avatar'];

test('the character studio is offered only when drawing, processing and avatar tools are all present', () => {
  const offered = (names: string[]) =>
    getCharacterStudioInstructions(tools(names), {
      modes: { generate: { supports: {} }, edit: { supports: {} } },
    })?.includes('character-studio') ?? false;
  expect(offered(all)).toBe(true);
  expect(offered(all.filter((name) => name !== 'agent_set_avatar'))).toBe(false);
  expect(offered(all.filter((name) => name !== 'generate_image'))).toBe(false);
});

test('blocks the workflow before candidates when reference editing is unavailable', () => {
  const instructions = getCharacterStudioInstructions(tools(all), {
    modes: { generate: { supports: {} } },
  });
  expect(instructions).toContain('Before generating any candidates');
  expect(instructions).not.toContain('#### references/prompts.md');
});
