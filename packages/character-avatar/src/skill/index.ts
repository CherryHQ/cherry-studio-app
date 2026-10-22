/**
 * The character-studio Skill: how an Agent designs an animated avatar character with the user.
 * Plain files so any host can register them; tool names are written as backticked ids.
 */
export const CHARACTER_STUDIO_SKILL_NAME = 'character-studio';

const SKILL = `---
name: ${CHARACTER_STUDIO_SKILL_NAME}
description: Design an original animated avatar character with the user and set it as an Agent's avatar. Use when the user asks to create, draw or change an avatar, mascot or character for an Agent.
license: Apache-2.0
metadata:
  author: Cherry Studio
  version: "1"
---

# Character studio

The app animates any character from six aligned images of the same head: idle, blink, thinking,
waiting, done, error. Only the face may differ between them. Your job is to produce that set.

1. **Brief.** If the user has not described the character, ask once with \`ask_user_question\`:
   what it is (person, animal, creature), its vibe, and a main colour. A reference image the user
   attached is welcome as inspiration. Never copy existing characters, mascots or logos.
2. **Base.** Prefer the avatar editor’s Create with AI flow: it checks model capabilities, saves progress and requires a sample approval before batching. If making the assets in this conversation, call \`generate_image\` with \`mode: "generate"\` 2–3 times with the base prompt in \`references/prompts.md\`.
   Look at each result with \`read_file\` and drop any that break the framing rules. Let the user
   pick with \`ask_user_question\` (describe each option in a few words).
3. **Canvas.** \`image_process\` \`resize\` the chosen base to \`size: 768\`. This is the idle frame.
4. **Expressions.** First generate and inspect ONLY blink. Ask the user to approve it before generating thinking, waiting, done and error. For each expression:
   - \`generate_image\` with \`mode: "edit"\`, a distinct \`name\`, and \`image_ids: [chosen base]\` and that expression's edit prompt.
   - \`image_process\` \`resize\` the result to 768, then \`transplant\` it onto the idle frame
     (\`file_entry_id\`: idle, \`other_file_entry_id\`: resized edit) with \`region\` set to the face
     (estimate it from the idle frame, e.g. eyes to chin).
   - Accept it when \`changedRatio\` is between 0.003 and 0.15 and the returned image shows the
     new expression with unchanged hair and outline. Otherwise retry the edit, at most twice.
5. **Cut-out.** \`image_process\` \`remove_background\` on all six frames with the same
   \`tolerance\` (start at 40). Check one result: if the subject has holes, lower the tolerance and
   redo all six; if a coloured rim remains, raise it.
6. **Save.** \`avatar_character_save\` with a short name and the six cut-out ids. Omit \`rig\`
   unless you are sure of a point; the app derives the frame and neck.
7. **Apply.** Ask whether to use it now, then \`agent_set_avatar\` with \`agent_id: "current"\`
   and a soft \`background\` that contrasts with the character.
8. **Report** in one or two sentences, including how many images you generated.

Before any image call, check the current drawing model capabilities in the tool description. If reference editing is not supported: tell the user
to choose an image model that supports editing in Settings, and stop. Never replace editing with generation. A missing reference or wrong character must stop the workflow before processing or saving.
`;

const PROMPTS = `Base prompt (fill in the brackets, keep every rule):

"[character description], [style, e.g. clean cel-shaded anime chibi / soft 3D clay / flat vector].
Head and shoulders only, head large and centred, facing the viewer, upright, eyes open, calm
closed-mouth smile. The whole head (hair, ears, horns, accessories) fits inside the image with
about 8% empty margin on every side. Plain solid [key colour] background, nothing else, no shadow
on the background, no text, no frame."

Key colour: pure green #00FF00, or pure magenta #FF00FF when the character itself is green. Never
use a colour that appears on the character.

Edit prompt for each expression (always attach the chosen base):

"Edit this image. Change ONLY the eyes, eyebrows, mouth and blush to [expression]. Keep the hair,
head outline, ears, accessories, clothing, pose, framing, size, position and the solid background
exactly the same."

- blink: eyes gently closed as curved lash lines, same calm smile
- thinking: eyes looking up and to the side, small pursed "hmm" mouth
- waiting: eyes wide and bright toward the viewer, eyebrows raised, small open "oh?" mouth
- done: happy closed "^ ^" eyes, big open smile, stronger blush
- error: worried teary eyes, tilted eyebrows, small wavy frown
`;

export const characterStudioSkill = {
  name: CHARACTER_STUDIO_SKILL_NAME,
  files: { 'SKILL.md': SKILL, 'references/prompts.md': PROMPTS },
} as const;
