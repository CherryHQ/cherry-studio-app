import { loggerService } from '@/shared/core/logger/LoggerService';

// Development-only diagnostics for the values that can move the message list.
export const scrollLog = loggerService.withContext('ChatScroll');
