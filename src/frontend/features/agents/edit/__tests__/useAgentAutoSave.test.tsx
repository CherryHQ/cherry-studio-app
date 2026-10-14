import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentSkillUpdate } from '@/shared/data/api/schemas/skills';
import type { SkillListItem } from '@/shared/data/types/skill';

import { createAgentSkillBindingDraft } from '../agentSkillSettings';
import { useAgentAutoSave } from '../useAgentAutoSave';

const mockReplaceAgentSkills = jest.fn<Promise<void>, [string, readonly AgentSkillUpdate[]]>();
const mockToastShow = jest.fn();
const mockToast = { show: mockToastShow };
const mockUpdateAgent = jest.fn();
const mockSetAgentAvatar = jest.fn();
const mockReplaceAgentToolBindings = jest.fn();

jest.mock('@cherrystudio/ui/components', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/hooks/agent', () => ({
  useAgentMutations: () => ({ updateAgent: mockUpdateAgent, setAgentAvatar: mockSetAgentAvatar }),
  useAgentToolBindingMutations: () => ({ replaceAgentToolBindings: mockReplaceAgentToolBindings }),
}));
jest.mock('@/frontend/hooks/skill', () => ({
  useSkillMutations: () => ({ replaceAgentSkills: mockReplaceAgentSkills }),
}));

type Snapshot = ReturnType<typeof useAgentAutoSave> & { bindings: Map<string, boolean> };
let snapshot: Snapshot;
let renderer: ReactTestRenderer | undefined;

function Probe({ skills }: { skills: readonly SkillListItem[] }) {
  const autoSave = useAgentAutoSave('agent-1');
  const bindings = createAgentSkillBindingDraft(skills, autoSave.skillBindingUpdates);
  useEffect(() => {
    snapshot = { ...autoSave, bindings };
  });
  return null;
}

async function render(skills: readonly SkillListItem[]) {
  await act(async () => {
    if (renderer) renderer.update(<Probe skills={skills} />);
    else renderer = create(<Probe skills={skills} />);
  });
}

beforeEach(() => {
  mockReplaceAgentSkills.mockReset();
  mockReplaceAgentSkills.mockResolvedValue(undefined);
  mockToastShow.mockClear();
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
});

it('follows installations, external binding changes and removals while the editor stays mounted', async () => {
  await render([skill('existing', false)]);
  expect(snapshot.bindings.get('existing')).toBe(false);

  await render([skill('existing', true), skill('installed', true)]);
  expect([...snapshot.bindings]).toEqual([
    ['existing', true],
    ['installed', true],
  ]);

  await render([skill('installed', false)]);
  expect([...snapshot.bindings]).toEqual([['installed', false]]);
});

it('keeps an unsaved toggle while a new installation arrives, then follows refreshed bindings', async () => {
  const save = deferred();
  mockReplaceAgentSkills.mockReturnValueOnce(save.promise);
  await render([skill('existing', false)]);
  await act(async () => snapshot.saveSkillBindings([{ skillId: 'existing', isEnabled: true }]));
  await render([skill('existing', false), skill('installed', true)]);
  expect([...snapshot.bindings]).toEqual([
    ['existing', true],
    ['installed', true],
  ]);

  // The real mutation resolves after the Agent query has refreshed.
  await render([skill('existing', true), skill('installed', true)]);
  await act(async () => save.resolve());
  expect(snapshot.skillBindingUpdates.size).toBe(0);

  await render([skill('existing', false), skill('installed', true)]);
  expect(snapshot.bindings.get('existing')).toBe(false);
});

it('does not clear a newer toggle when an older save confirms the same boolean', async () => {
  const first = deferred();
  const latest = deferred();
  mockReplaceAgentSkills.mockReturnValueOnce(first.promise).mockReturnValueOnce(latest.promise);
  await render([skill('existing', true)]);
  await act(async () => snapshot.saveSkillBindings([{ skillId: 'existing', isEnabled: false }]));
  await act(async () => snapshot.saveSkillBindings([{ skillId: 'existing', isEnabled: true }]));
  await act(async () => snapshot.saveSkillBindings([{ skillId: 'existing', isEnabled: false }]));
  await render([skill('existing', false)]);
  await act(async () => first.resolve());
  expect(mockReplaceAgentSkills).toHaveBeenCalledTimes(2);
  expect(snapshot.skillBindingUpdates.get('existing')?.isEnabled).toBe(false);

  await render([skill('existing', true)]);
  expect(snapshot.bindings.get('existing')).toBe(false);
  await render([skill('existing', false)]);
  await act(async () => latest.resolve());
  expect(snapshot.skillBindingUpdates.size).toBe(0);
});

it('retains a failed toggle for retry and releases it after a successful refresh', async () => {
  mockReplaceAgentSkills.mockRejectedValueOnce(new Error('save failed'));
  await render([skill('existing', true)]);
  await act(async () => snapshot.saveSkillBindings([{ skillId: 'existing', isEnabled: false }]));
  expect(snapshot.hasFailedSave).toBe(true);
  expect(snapshot.bindings.get('existing')).toBe(false);
  expect(mockToastShow).toHaveBeenCalledWith({
    label: 'agent.toast.saveFailed',
    variant: 'danger',
  });

  await render([skill('existing', false)]);
  await act(async () => snapshot.retry());
  expect(snapshot.hasFailedSave).toBe(false);
  expect(snapshot.skillBindingUpdates.size).toBe(0);
  expect(mockReplaceAgentSkills).toHaveBeenLastCalledWith('agent-1', [
    { skillId: 'existing', isEnabled: false },
  ]);
});

function skill(id: string, isEnabled: boolean): SkillListItem {
  return { id, binding: { isEnabled } } as SkillListItem;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
