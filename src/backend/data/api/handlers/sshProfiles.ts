import type { SshProfileService } from '@/backend/data/services/SshProfileService';
import type { SshProfileSchemas } from '@/shared/data/api/schemas/sshProfiles';
import type { HandlersFor } from '@/shared/data/api/types';

export function createSshProfileHandlers(
  service: Pick<SshProfileService, 'list'>,
): HandlersFor<SshProfileSchemas> {
  return { '/ssh-profiles': { GET: () => service.list() } };
}
