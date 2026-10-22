import { characterStudioSkill } from '@cherrystudio/character-avatar/skill';
import type { ImageGenerationSupport } from '@cherrystudio/provider-registry';

import type { BuiltInToolCapabilityId } from '@/shared/data/types/builtInTool';

import { parseSkillEntry } from '../skillPackage';

const REQUIRED_TOOLS: readonly BuiltInToolCapabilityId[] = [
  'generate_image',
  'image_process',
  'avatar_character_save',
  'agent_set_avatar',
];

/** Travels with the deferred avatar tool only when every design capability is available. */
export function getCharacterStudioInstructions(
  availableTools: ReadonlyMap<string, string>,
  support?: ImageGenerationSupport | null,
): string | undefined {
  if (!REQUIRED_TOOLS.every((name) => availableTools.has(name))) return undefined;
  if (!support?.modes.generate || !support.modes.edit) {
    return 'Animated avatar creation is unavailable with the current drawing model: both generation and reference-image editing are required. Before generating any candidates, ask the user to open the avatar editor and choose Create with AI, which offers compatible models. Do not generate expressions as unrelated new images.';
  }
  const entry = parseSkillEntry(characterStudioSkill.files['SKILL.md']);
  if (!entry || !('body' in entry)) return undefined;
  const resources = Object.entries(characterStudioSkill.files)
    .filter(([path]) => path !== 'SKILL.md')
    .map(([path, content]) => `#### ${path}\n\n${content.trim()}`);
  let instructions = [
    `### ${characterStudioSkill.name}\n\n${entry.frontmatter.description}`,
    entry.body.trim(),
    ...resources,
  ].join('\n\n');
  for (const name of REQUIRED_TOOLS)
    instructions = instructions.replaceAll(`\`${name}\``, `\`${availableTools.get(name)}\``);
  return instructions;
}
