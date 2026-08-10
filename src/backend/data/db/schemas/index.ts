import { agentTable } from './agent';
import { agentChannelTable, agentChannelTaskTable } from './agentChannel';
import { agentGlobalSkillTable } from './agentGlobalSkill';
import { agentSessionTable } from './agentSession';
import { agentSessionMessageTable } from './agentSessionMessage';
import { agentSkillTable } from './agentSkill';
import { agentWorkspaceTable } from './agentWorkspace';
import { aiUsageRecordTable } from './aiUsageRecord';
import { appStateTable } from './appState';
import { assistantTable } from './assistant';
import {
  agentKnowledgeBaseTable,
  agentMcpServerTable,
  assistantKnowledgeBaseTable,
  assistantMcpServerTable,
} from './assistantRelations';
import { fileEntryTable } from './file';
import {
  chatMessageFileRefTable,
  jobFileRefTable,
  miniAppLogoFileRefTable,
  paintingFileRefTable,
  providerLogoFileRefTable,
} from './fileRelations';
import { groupTable } from './group';
import { jobScheduleTable, jobTable } from './job';
import { knowledgeBaseTable, knowledgeItemTable } from './knowledge';
import { mcpServerTable } from './mcpServer';
import { messageTable } from './message';
import { miniAppTable } from './miniApp';
import { noteTable } from './note';
import { paintingTable } from './painting';
import { pinTable } from './pin';
import { preferenceTable } from './preference';
import { promptTable } from './prompt';
import { entityTagTable, tagTable } from './tagging';
import { topicTable } from './topic';
import { translateHistoryTable } from './translateHistory';
import { translateLanguageTable } from './translateLanguage';
import { userModelTable } from './userModel';
import { userProviderTable } from './userProvider';

export * from './agent';
export * from './agentChannel';
export * from './agentGlobalSkill';
export * from './agentSession';
export * from './agentSessionMessage';
export * from './agentSkill';
export * from './agentWorkspace';
export * from './aiUsageRecord';
export * from './assistant';
export * from './assistantRelations';
export * from './fileRelations';
export * from './group';
export * from './job';
export * from './mcpServer';
export * from './message';
export * from './miniApp';
export * from './note';
export * from './painting';
export * from './pin';
export * from './tagging';
export * from './userModel';
export * from './userProvider';

export { appStateTable } from './appState';
export { fileEntryTable } from './file';
export { knowledgeBaseTable, knowledgeItemTable } from './knowledge';
export { preferenceTable } from './preference';
export { promptTable } from './prompt';
export { topicTable } from './topic';
export { translateHistoryTable } from './translateHistory';
export { translateLanguageTable } from './translateLanguage';

export type AppStateRow = typeof appStateTable.$inferSelect;
export type InsertAppStateRow = typeof appStateTable.$inferInsert;
export type FileEntryRow = typeof fileEntryTable.$inferSelect;
export type InsertFileEntryRow = typeof fileEntryTable.$inferInsert;
export type KnowledgeBaseRow = typeof knowledgeBaseTable.$inferSelect;
export type InsertKnowledgeBaseRow = typeof knowledgeBaseTable.$inferInsert;
export type KnowledgeItemRow = typeof knowledgeItemTable.$inferSelect;
export type InsertKnowledgeItemRow = typeof knowledgeItemTable.$inferInsert;
export type PreferenceRow = typeof preferenceTable.$inferSelect;
export type InsertPreferenceRow = typeof preferenceTable.$inferInsert;
export type PromptRow = typeof promptTable.$inferSelect;
export type InsertPromptRow = typeof promptTable.$inferInsert;
export type TopicRow = typeof topicTable.$inferSelect;
export type InsertTopicRow = typeof topicTable.$inferInsert;
export type TranslateHistoryRow = typeof translateHistoryTable.$inferSelect;
export type InsertTranslateHistoryRow = typeof translateHistoryTable.$inferInsert;
export type TranslateLanguageRow = typeof translateLanguageTable.$inferSelect;
export type InsertTranslateLanguageRow = typeof translateLanguageTable.$inferInsert;

export const schema = {
  agentChannelTable,
  agentChannelTaskTable,
  agentGlobalSkillTable,
  agentKnowledgeBaseTable,
  agentMcpServerTable,
  agentSessionMessageTable,
  agentSessionTable,
  agentSkillTable,
  agentTable,
  agentWorkspaceTable,
  aiUsageRecordTable,
  appStateTable,
  assistantKnowledgeBaseTable,
  assistantMcpServerTable,
  assistantTable,
  chatMessageFileRefTable,
  entityTagTable,
  fileEntryTable,
  groupTable,
  jobScheduleTable,
  jobFileRefTable,
  jobTable,
  knowledgeBaseTable,
  knowledgeItemTable,
  mcpServerTable,
  messageTable,
  miniAppLogoFileRefTable,
  miniAppTable,
  noteTable,
  paintingFileRefTable,
  paintingTable,
  pinTable,
  preferenceTable,
  promptTable,
  providerLogoFileRefTable,
  tagTable,
  topicTable,
  translateHistoryTable,
  translateLanguageTable,
  userModelTable,
  userProviderTable,
};

export type DatabaseSchema = typeof schema;
