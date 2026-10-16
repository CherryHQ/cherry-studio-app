import { SetAgentAvatarSchema } from '@/shared/data/api/schemas/agents';

import {
  AvatarRecipeSchema,
  AvatarResourceSchema,
  avatarResourceFiles,
  isAvatarSource,
} from '../avatar';

const id = '00000000-0000-4000-8000-000000000001';

test('resource references are portable and cannot address arbitrary files', () => {
  expect(isAvatarSource(`avatar-resource:${id}`)).toBe(true);
  expect(isAvatarSource(`avatar-draft:${id}`)).toBe(true);
  expect(avatarResourceFiles(`avatar-resource:${id}`)).toEqual([`${id}.json`, `${id}.png`]);
  for (const reference of [
    null,
    '🍒',
    `avatar-resource:../${id}`,
    `file:///${id}.json`,
    `avatar-resource:${id}/cover.png`,
  ]) {
    expect(isAvatarSource(reference)).toBe(false);
  }
  expect(() => avatarResourceFiles(`avatar-draft:${id}`)).toThrow();
});

test('the resource owns the editable recipe; the Agent endpoint accepts only its source', () => {
  const recipe = {
    character: '00000000-0000-4000-8000-0000000000aa',
    background: '#d6f2e2',
  };
  const resource = { version: 1, kind: 'character', recipe };
  expect(AvatarResourceSchema.parse(JSON.parse(JSON.stringify(resource)))).toEqual(resource);
  expect(
    AvatarResourceSchema.safeParse({ ...resource, coverUri: 'file:///cache/a.png' }).success,
  ).toBe(false);
  expect(AvatarResourceSchema.safeParse({ ...resource, version: 2 }).success).toBe(false);
  for (const patch of [
    { character: 'cherry' },
    { background: 'url(https://example.com/a.png)' },
    { background: '#FFF' },
  ]) {
    expect(AvatarRecipeSchema.safeParse({ ...recipe, ...patch }).success).toBe(false);
  }
  const source = { sourceUri: `avatar-draft:${id}` };
  expect(SetAgentAvatarSchema.parse(source)).toEqual(source);
  expect(SetAgentAvatarSchema.safeParse({ ...source, recipe }).success).toBe(false);
});
