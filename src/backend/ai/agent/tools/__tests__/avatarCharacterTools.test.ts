import { CharacterPackError } from '@cherrystudio/character-avatar/layers';

import { validateAvatarExpression } from '@/backend/services/avatars/avatarStudioQuality';

import { createAvatarCharacterTools } from '../avatarCharacterTools';

jest.mock('@/backend/services/file/rgbaImageCodec', () => ({
  decodeRgba: () => ({ width: 768, height: 768, data: new Uint8Array() }),
}));
jest.mock('@/backend/services/avatars/avatarStudioQuality', () => ({
  validateAvatarExpression: jest.fn(),
}));

jest.mock('@shopify/react-native-skia', () => ({
  Skia: {
    Data: { fromBytes: () => ({ dispose: () => {} }) },
    Image: { MakeImageFromEncoded: () => ({ width: () => 768, dispose: () => {} }) },
  },
}));
jest.mock('@cherrystudio/character-avatar/cover', () => ({
  drawCharacterCover: () => new Uint8Array([9, 9]),
}));
jest.mock('expo-file-system', () => ({
  File: class {
    async bytes() {
      return new Uint8Array([1]);
    }
  },
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const layers = {
  idle: id(1),
  blink: id(2),
  thinking: id(3),
  waiting: id(4),
  done: id(5),
  error: id(6),
};
const character = {
  id: id(50),
  manifest: {
    version: 1 as const,
    name: 'Mochi',
    size: 768,
    rig: { frame: { center: { x: 384, y: 384 }, side: 700 }, neck: { x: 384, y: 650 }, sways: [] },
  },
  layers: { idle: 'file:///library/idle.webp' },
};
function setup(mediaType = 'image/png') {
  const dependencies = {
    characters: {
      saveCharacter: jest.fn(async () => character.id),
      listCharacters: jest.fn(async () => [character]),
    },
    resources: { createDraft: jest.fn(async () => `avatar-draft:${id(60)}`) },
    agentAvatars: { setAvatar: jest.fn(async (agentId: string) => ({ id: agentId }) as never) },
  };
  const files = {
    resolveAvailable: jest.fn(
      async (list: readonly string[]) =>
        new Map(
          list.map((fileId) => [fileId, { fileEntryId: fileId, mediaType, name: 'f', size: 1 }]),
        ),
    ),
    readAsBytes: jest.fn(async () => new Uint8Array([1])),
  };
  const scope = { fileEntryIds: new Set(Object.values(layers)) } as never;
  const [save, setAvatar] = createAvatarCharacterTools(dependencies, files as never, scope, id(70));
  const call = (tool: typeof save, input: object) =>
    tool!.execute({
      input: input as never,
      signal: new AbortController().signal,
      toolCallId: 'c',
      turnId: 't',
    });
  return {
    dependencies,
    save: (input: object) => call(save, input),
    setAvatar: (input: object) => call(setAvatar, input),
  };
}

test('saves conversation images as a character sized from the idle layer', async () => {
  const { dependencies, save } = setup();
  const result = await save({ name: 'Mochi', layers });
  expect(result.value).toEqual({
    status: 'created',
    characterId: character.id,
    name: 'Mochi',
    size: 768,
  });
  expect(dependencies.characters.saveCharacter).toHaveBeenCalledWith(
    expect.objectContaining({
      manifest: { version: 1, name: 'Mochi', size: 768, rig: { sways: [] } },
      layers: expect.objectContaining({
        idle: { bytes: expect.any(Uint8Array), extension: 'png' },
      }),
    }),
  );
});

test('refuses an unrelated expression before saving any character', async () => {
  jest.mocked(validateAvatarExpression).mockImplementationOnce(() => {
    throw new Error('avatar_alignment');
  });
  const { dependencies, save } = setup();
  expect((await save({ name: 'Mochi', layers })).value).toMatchObject({
    status: 'error',
    code: 'avatar_alignment',
  });
  expect(dependencies.characters.saveCharacter).not.toHaveBeenCalled();
});

test('reports layer problems to the model instead of failing the turn', async () => {
  const { dependencies, save } = setup();
  dependencies.characters.saveCharacter.mockRejectedValueOnce(
    new CharacterPackError('not-transparent', 'Layers need a transparent background.'),
  );
  expect((await save({ name: 'Mochi', layers })).value).toMatchObject({
    status: 'error',
    code: 'avatar_not_transparent',
  });
  expect((await setup('image/jpeg').save({ name: 'Mochi', layers })).value).toMatchObject({
    code: 'avatar_layer_invalid',
  });
});

test('sets the current Agent avatar from a library character with a drawn cover', async () => {
  const { dependencies, setAvatar } = setup();
  const result = await setAvatar({ agent_id: 'current', character_id: character.id });
  expect(dependencies.resources.createDraft).toHaveBeenCalledWith({
    recipe: { character: character.id, background: '#ffe1de' },
    png: 'data:image/png;base64,CQk=',
  });
  expect(dependencies.agentAvatars.setAvatar).toHaveBeenCalledWith(id(70), {
    sourceUri: `avatar-draft:${id(60)}`,
  });
  expect(result.value).toMatchObject({ status: 'updated', agentId: id(70) });
});
