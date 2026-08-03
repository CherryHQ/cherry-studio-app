import { AGENT_SESSION_MESSAGE_FTS_STATEMENTS, MESSAGE_FTS_STATEMENTS } from './schemas';

export const customSqlStatements: string[] = [
  ...MESSAGE_FTS_STATEMENTS,
  ...AGENT_SESSION_MESSAGE_FTS_STATEMENTS,
];
