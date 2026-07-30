import type { EntityType } from '@/shared/domain/entityType';

export const pinQueryKeys = {
  detail: (pinId: string) => [`/pins/${pinId}`] as const,
  list: (params: { entityType: EntityType }) => ['/pins', params] as const,
};
