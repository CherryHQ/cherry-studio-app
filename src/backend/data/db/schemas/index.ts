import { aiUsageRecordTable } from './aiUsageRecord';
import { appStateTable } from './appState';
import { assistantTable } from './assistant';
import { assistantMcpServerTable } from './assistantRelations';
import { fileEntryTable } from './file';
import { jobTable } from './job';
import { mcpServerTable } from './mcpServer';
import { messageTable } from './message';
import { paintingTable } from './painting';
import { preferenceTable } from './preference';
import { topicTable } from './topic';
import { userModelTable } from './userModel';
import { userProviderTable } from './userProvider';

export * from './aiUsageRecord';
export * from './assistant';
export * from './assistantRelations';
export * from './job';
export * from './mcpServer';
export * from './message';
export * from './painting';
export * from './userModel';
export * from './userProvider';

export { appStateTable } from './appState';
export { fileEntryTable } from './file';
export { preferenceTable } from './preference';
export { topicTable } from './topic';

export type AppStateRow = typeof appStateTable.$inferSelect;
export type InsertAppStateRow = typeof appStateTable.$inferInsert;
export type FileEntryRow = typeof fileEntryTable.$inferSelect;
export type InsertFileEntryRow = typeof fileEntryTable.$inferInsert;
export type PreferenceRow = typeof preferenceTable.$inferSelect;
export type InsertPreferenceRow = typeof preferenceTable.$inferInsert;
export type TopicRow = typeof topicTable.$inferSelect;
export type InsertTopicRow = typeof topicTable.$inferInsert;

export const schema = {
  aiUsageRecordTable,
  appStateTable,
  assistantMcpServerTable,
  assistantTable,
  fileEntryTable,
  jobTable,
  mcpServerTable,
  messageTable,
  paintingTable,
  preferenceTable,
  topicTable,
  userModelTable,
  userProviderTable,
};

export type DatabaseSchema = typeof schema;
