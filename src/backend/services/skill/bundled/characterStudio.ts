import { characterStudioSkill } from '@cherrystudio/character-avatar/skill';

import type { BundledSkillDefinition } from './index';

/** Ships with the character package; offered when drawing and Agent management are enabled. */
export const characterStudioBundledSkill: BundledSkillDefinition = {
  ...characterStudioSkill,
  requiredTools: ['generate_image', 'image_process', 'avatar_character_save', 'agent_set_avatar'],
};
