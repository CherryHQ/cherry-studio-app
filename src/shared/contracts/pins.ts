import type { EntityType } from '@/shared/domain/entityType';
import type { CreatePinDto, Pin } from '@/shared/domain/pin';

export interface PinsBackend {
  list(entityType: EntityType): Promise<Pin[]>;
  pin(input: CreatePinDto): Promise<Pin>;
  unpin(id: string): Promise<void>;
}
