import { appStateTable } from './appState';
import { assistantTable } from './assistant';
import { assistantKnowledgeBaseTable, assistantMcpServerTable } from './assistantRelations';
import { fileEntryTable } from './file';
import { chatMessageFileRefTable } from './fileRelations';
import { groupTable } from './group';
import { messageTable } from './message';
import { pinTable } from './pin';
import { preferenceTable } from './preference';
import { promptTable } from './prompt';
import { entityTagTable, tagTable } from './tagging';
import { topicTable } from './topic';
import { userModelTable } from './userModel';
import { userProviderTable } from './userProvider';

export type { AppStateRow, InsertAppStateRow } from './appState';
export { appStateTable } from './appState';
export type { AssistantRow, InsertAssistantRow } from './assistant';
export { assistantTable } from './assistant';
export type {
  AssistantKnowledgeBaseRow,
  AssistantMcpServerRow,
  InsertAssistantKnowledgeBaseRow,
  InsertAssistantMcpServerRow,
} from './assistantRelations';
export {
  assistantKnowledgeBaseTable,
  assistantMcpServerTable,
} from './assistantRelations';
export type { FileEntryRow, InsertFileEntryRow } from './file';
export { fileEntryTable } from './file';
export type { ChatMessageFileRefRow, InsertChatMessageFileRefRow } from './fileRelations';
export { chatMessageFileRefTable } from './fileRelations';
export type { GroupRow, InsertGroupRow } from './group';
export { groupTable } from './group';
export type { InsertMessageRow, MessageRow } from './message';
export { MESSAGE_FTS_STATEMENTS, messageTable } from './message';
export type { InsertPinRow, PinRow } from './pin';
export { pinTable } from './pin';
export type { InsertPreferenceRow, PreferenceRow } from './preference';
export { preferenceTable } from './preference';
export type { InsertPromptRow, PromptRow } from './prompt';
export { promptTable } from './prompt';
export type {
  EntityTagRow,
  InsertEntityTagRow,
  InsertTagRow,
  TagRow,
} from './tagging';
export { entityTagTable, tagTable } from './tagging';
export type { InsertTopicRow, TopicRow } from './topic';
export { topicTable } from './topic';
export type { InsertUserModelRow, UserModelRow } from './userModel';
export { userModelTable } from './userModel';
export type { InsertUserProviderRow, UserProviderRow } from './userProvider';
export { userProviderTable } from './userProvider';

export const schema = {
  assistantKnowledgeBaseTable,
  assistantMcpServerTable,
  assistantTable,
  appStateTable,
  chatMessageFileRefTable,
  fileEntryTable,
  groupTable,
  messageTable,
  pinTable,
  preferenceTable,
  promptTable,
  tagTable,
  entityTagTable,
  topicTable,
  userModelTable,
  userProviderTable,
};

export type DatabaseSchema = typeof schema;
