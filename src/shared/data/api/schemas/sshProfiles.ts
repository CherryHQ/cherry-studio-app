import type { SshProfile } from '@/shared/data/types/ssh';

export type SshProfileSchemas = {
  '/ssh-profiles': { GET: { response: SshProfile[] } };
};
