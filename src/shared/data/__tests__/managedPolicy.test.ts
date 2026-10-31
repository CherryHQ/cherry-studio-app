import { LOCAL_PROFILE, setActiveProfile } from '../activeProfile';
import { agentPolicy, editionCapabilities, managedResourcePolicy } from '../managedPolicy';

describe('managedPolicy', () => {
  afterEach(() => setActiveProfile(LOCAL_PROFILE));

  it('leaves provider and model settings to the organization in an enterprise profile', () => {
    expect(editionCapabilities().providerSettings).toBe(true);
    setActiveProfile({
      id: '8a1f4e9c-2b7d-4c1a-9e3f-1d2c3b4a5f60',
      identity: { deployment: 's', issuer: 'i', subject: 'u', productProfileId: 'o' },
      address: 'https://e.example.com',
    });
    expect(editionCapabilities()).toEqual({
      providerSettings: false,
      modelSettings: false,
      providerOnboarding: false,
      desktopConfigImport: false,
    });
  });

  it('keeps a managed Agent’s user-adjustable fields and a pool of several models open', () => {
    const managed = agentPolicy({ isManaged: true, allowedModelIds: ['a::m', 'b::n'] });
    expect(managed).toMatchObject({ managed: true, canDelete: false, canBind: false });
    expect(managed.revealsSecrets).toBe(false);
    expect(['model', 'mode', 'disabledCapabilities'].every(managed.canEdit)).toBe(true);
    expect(['name', 'avatar', 'instructions', 'skills'].some(managed.canEdit)).toBe(false);
    expect(agentPolicy({ isManaged: true, allowedModelIds: ['a::m'] }).canEdit('model')).toBe(
      false,
    );
    expect(agentPolicy({ isManaged: true }).allowedModelIds).toEqual([]);
  });

  it('leaves user resources open and locks delivered MCP servers and Skills', () => {
    expect(agentPolicy(undefined)).toMatchObject({ managed: false, allowedModelIds: null });
    expect(agentPolicy({ isManaged: false }).canEdit('name')).toBe(true);
    expect(managedResourcePolicy({ isManaged: true })).toMatchObject({
      canDelete: false,
      revealsSecrets: false,
    });
    expect(managedResourcePolicy({}).canEdit('server')).toBe(true);
  });
});
