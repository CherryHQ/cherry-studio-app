/**
 * `avatar_character_save` and `agent_set_avatar`: the app-side ends of character creation. Layer
 * rules, anchor derivation and the cover drawing belong to `@cherrystudio/character-avatar`; these
 * tools only move conversation files into the library and attach a character to an Agent.
 */

import { drawCharacterCover } from '@cherrystudio/character-avatar/cover';
import { CharacterPackError } from '@cherrystudio/character-avatar/layers';
import { CHARACTER_EXPRESSIONS } from '@cherrystudio/character-avatar/manifest';
import { Skia } from '@shopify/react-native-skia';
import { fromByteArray } from 'base64-js';
import { File } from 'expo-file-system';
import * as z from 'zod';

import type { AgentAvatars } from '@/backend/services/agents/createAgentAvatars';
import type { AvatarCharacters } from '@/backend/services/avatars/avatarCharacters';
import type { AvatarResources } from '@/backend/services/avatars/avatarResources';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import type { ManagedFileResolver, TurnFileScope } from '../resources/managedFileResolver';
import type { RuntimeTool, RuntimeToolResult } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export const AVATAR_CHARACTER_SAVE_TOOL_NAME = 'avatar_character_save';
export const AGENT_SET_AVATAR_TOOL_NAME = 'agent_set_avatar';

export type AvatarCharacterToolDependencies = {
  characters: Pick<AvatarCharacters, 'saveCharacter' | 'listCharacters'>;
  resources: Pick<AvatarResources, 'createDraft'>;
  agentAvatars: Pick<AgentAvatars, 'setAvatar'>;
};

const FileIdSchema = z
  .string()
  .refine((value) => FileEntryIdSchema.safeParse(value).success, 'Must be a managed file UUID.');
const PointSchema = z.strictObject({ x: z.number().min(0), y: z.number().min(0) });

const saveInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(40).describe('Character name shown in the avatar editor.'),
  layers: z
    .strictObject({
      ...Object.fromEntries(CHARACTER_EXPRESSIONS.map((name) => [name, FileIdSchema])),
      tuft: FileIdSchema.optional(),
    } as Record<(typeof CHARACTER_EXPRESSIONS)[number], typeof FileIdSchema> & {
      tuft: z.ZodOptional<typeof FileIdSchema>;
    })
    .describe(
      'One transparent PNG or WebP per expression, all the same square size and aligned so only the face differs. `tuft` is an optional separate hair-tuft layer.',
    ),
  rig: z
    .strictObject({
      neck: PointSchema.optional(),
      tuft_pivot: PointSchema.optional(),
      sways: z.array(PointSchema).max(4).optional(),
    })
    .optional()
    .describe(
      'Optional anchors in pixels: `neck` (squash/tilt pivot), `tuft_pivot` (required with a `tuft` layer), `sways` (centres of hair masses that swing). The frame and neck are derived from the idle silhouette when omitted.',
    ),
});

const setAvatarInputSchema = z.strictObject({
  agent_id: z
    .string()
    .min(1)
    .describe('Agent id, or `current` for the Agent of this conversation.'),
  character_id: z.string().describe('Id returned by `avatar_character_save`.'),
  background: z
    .string()
    .regex(/^#[0-9a-f]{6}$/)
    .optional()
    .describe('Circle colour behind the character, `#rrggbb` lowercase. Defaults to a soft pink.'),
});

const DEFAULT_BACKGROUND = '#ffe1de';
const COVER_SIZE = 512;
const LAYER_EXTENSIONS: Record<string, 'png' | 'webp'> = {
  'image/png': 'png',
  'image/webp': 'webp',
};

function invalid(code: string, message: string): RuntimeToolResult {
  return { value: { status: 'error', code, message }, artifacts: [] };
}

export function createAvatarCharacterTools(
  dependencies: AvatarCharacterToolDependencies,
  files: Pick<ManagedFileResolver, 'readAsBytes' | 'resolveAvailable'>,
  scope: TurnFileScope,
  currentAgentId: string | undefined,
): RuntimeTool[] {
  const save: RuntimeTool = {
    ref: { source: 'builtin', capabilityId: AVATAR_CHARACTER_SAVE_TOOL_NAME },
    providerName: AVATAR_CHARACTER_SAVE_TOOL_NAME,
    displayName: 'Save avatar character',
    deferred: true,
    description:
      "Store a set of aligned expression images as an animated character in the user's avatar library. The app animates it; returns the character id.",
    inputSchema: toRuntimeInputSchema(saveInputSchema),
    approval: 'ask',
    async execute({ input, signal }) {
      const parsed = saveInputSchema.safeParse(input);
      if (!parsed.success) {
        return invalid('avatar_invalid_input', z.prettifyError(parsed.error));
      }
      const { name, layers, rig } = parsed.data;
      if (layers.tuft && !rig?.tuft_pivot) {
        return invalid('avatar_invalid_input', 'A `tuft` layer needs `rig.tuft_pivot`.');
      }
      const entries = Object.entries(layers).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      );
      const ids = entries.map(([, id]) => FileEntryIdSchema.parse(id));
      if (ids.some((id) => !scope.fileEntryIds.has(id))) {
        return invalid('avatar_file_unavailable', 'A layer is not part of this conversation.');
      }
      const available = await files.resolveAvailable(ids);
      const loaded: Record<string, { bytes: Uint8Array; extension: 'png' | 'webp' }> = {};
      for (const [layer, id] of entries) {
        const fact = available.get(id);
        const extension = fact && LAYER_EXTENSIONS[fact.mediaType];
        if (!fact || !extension) {
          return invalid(
            'avatar_layer_invalid',
            `Layer "${layer}" must be an available PNG or WebP image with transparency.`,
          );
        }
        const bytes = await files.readAsBytes(fact, signal);
        if (!bytes) return invalid('avatar_file_unavailable', `Layer "${layer}" is unreadable.`);
        loaded[layer] = { bytes, extension };
      }
      signal.throwIfAborted();
      const size = imageWidth(loaded.idle!.bytes);
      try {
        const id = await dependencies.characters.saveCharacter({
          manifest: {
            version: 1,
            name,
            size,
            rig: {
              ...(rig?.neck && { neck: rig.neck }),
              ...(rig?.tuft_pivot && { tuft: { pivot: rig.tuft_pivot } }),
              sways: rig?.sways ?? [],
            },
          },
          layers: loaded,
        });
        return { value: { status: 'created', characterId: id, name, size }, artifacts: [] };
      } catch (error) {
        if (error instanceof CharacterPackError) {
          return invalid(`avatar_${error.code.replaceAll('-', '_')}`, error.message);
        }
        throw error;
      }
    },
  };

  const setAvatar: RuntimeTool = {
    ref: { source: 'builtin', capabilityId: AGENT_SET_AVATAR_TOOL_NAME },
    providerName: AGENT_SET_AVATAR_TOOL_NAME,
    displayName: 'Set Agent avatar',
    deferred: true,
    description:
      "Make a library character an Agent's animated avatar. It reacts to the Agent's activity in conversations.",
    inputSchema: toRuntimeInputSchema(setAvatarInputSchema),
    approval: 'ask',
    async execute({ input }) {
      const parsed = setAvatarInputSchema.safeParse(input);
      if (!parsed.success) {
        return invalid('avatar_invalid_input', z.prettifyError(parsed.error));
      }
      const agentId = parsed.data.agent_id === 'current' ? currentAgentId : parsed.data.agent_id;
      if (!agentId)
        return invalid('avatar_invalid_input', 'No current Agent in this conversation.');
      const characters = await dependencies.characters.listCharacters();
      const character = characters.find(({ id }) => id === parsed.data.character_id);
      if (!character) return invalid('avatar_character_missing', 'Unknown character id.');
      const background = parsed.data.background ?? DEFAULT_BACKGROUND;
      const decode = async (uri: string | undefined) => {
        if (!uri) return null;
        const data = Skia.Data.fromBytes(await new File(uri).bytes());
        try {
          return Skia.Image.MakeImageFromEncoded(data);
        } finally {
          data.dispose();
        }
      };
      const idle = await decode(character.layers.idle);
      const tuft = character.manifest.rig.tuft ? await decode(character.layers.tuft) : null;
      if (!idle) return invalid('avatar_character_missing', 'The character artwork is unreadable.');
      let png: Uint8Array;
      try {
        png = drawCharacterCover({
          rig: { size: character.manifest.size, ...character.manifest.rig },
          idle,
          tuft,
          background,
          size: COVER_SIZE,
        });
      } finally {
        idle.dispose();
        tuft?.dispose();
      }
      const draft = await dependencies.resources.createDraft({
        recipe: { character: character.id, background },
        png: `data:image/png;base64,${fromByteArray(png)}`,
      });
      const agent = await dependencies.agentAvatars.setAvatar(agentId, { sourceUri: draft });
      return {
        value: { status: 'updated', agentId: agent.id, characterId: character.id, background },
        artifacts: [],
      };
    },
  };

  return [save, setAvatar];
}

function imageWidth(bytes: Uint8Array): number {
  const data = Skia.Data.fromBytes(bytes);
  const image = Skia.Image.MakeImageFromEncoded(data);
  try {
    return image?.width() ?? 0;
  } finally {
    image?.dispose();
    data.dispose();
  }
}
