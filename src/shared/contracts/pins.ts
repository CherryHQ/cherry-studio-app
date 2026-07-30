import type { EntityType } from '@/shared/data/types/entityType';
import type { CreatePinDto, Pin } from '@/shared/data/types/pin';

export interface PinsBackend {
  list(entityType: EntityType): Promise<Pin[]>;
  pin(input: CreatePinDto): Promise<Pin>;
  unpin(id: string): Promise<void>;
}
