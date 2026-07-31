import type { EntityType } from '@/shared/data/types/entityType';
import type { CreatePinDto, Pin } from '@/shared/data/types/pin';

export type PinSchemas = {
  '/pins': {
    GET: {
      query: { entityType: EntityType };
      response: Pin[];
    };
    POST: {
      body: CreatePinDto;
      response: Pin;
    };
  };
  '/pins/:id': {
    DELETE: {
      params: { id: string };
      response: undefined;
    };
  };
};
