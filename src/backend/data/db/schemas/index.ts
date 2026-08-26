import { agentTable } from './agent';
import { agentSessionTable } from './agentSession';
import { agentSessionMessageTable } from './agentSessionMessage';
import { agentToolBindingTable } from './agentToolBinding';
import { aiUsageRecordTable } from './aiUsageRecord';
import { appStateTable } from './appState';
import { fileEntryTable } from './file';
import { jobTable } from './job';
import { mcpServerTable } from './mcpServer';
import { paintingTable } from './painting';
import { preferenceTable } from './preference';
import { userModelTable } from './userModel';
import { userProviderTable } from './userProvider';

export * from './agent';
export * from './agentToolBinding';
export * from './agentSession';
export * from './agentSessionMessage';
export * from './aiUsageRecord';
export { monotonicUpdateTimestamp } from './_columnHelpers';
export * from './job';
export * from './mcpServer';
export * from './painting';
export * from './userModel';
export * from './userProvider';

export { appStateTable } from './appState';
export { fileEntryTable } from './file';
export { preferenceTable } from './preference';

export type AppStateRow = typeof appStateTable.$inferSelect;
export type InsertAppStateRow = typeof appStateTable.$inferInsert;
export type FileEntryRow = typeof fileEntryTable.$inferSelect;
export type InsertFileEntryRow = typeof fileEntryTable.$inferInsert;
export type PreferenceRow = typeof preferenceTable.$inferSelect;
export type InsertPreferenceRow = typeof preferenceTable.$inferInsert;

export const schema = {
  agentTable,
  agentToolBindingTable,
  agentSessionTable,
  agentSessionMessageTable,
  aiUsageRecordTable,
  appStateTable,
  fileEntryTable,
  jobTable,
  mcpServerTable,
  paintingTable,
  preferenceTable,
  userModelTable,
  userProviderTable,
};

export type DatabaseSchema = typeof schema;
