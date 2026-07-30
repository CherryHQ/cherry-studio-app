import type { AiUsageRecordAuthMethod } from '@/data/types/aiUsageRecord';

export type ServingCredentialReceipt =
  | {
      attribution: 'explicit' | 'matched';
      id: string;
      label?: string;
      masked: string;
    }
  | { attribution: 'auth'; method: AiUsageRecordAuthMethod }
  | { attribution: 'unknown' };
