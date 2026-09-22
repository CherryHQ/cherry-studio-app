import type { TFunction } from 'i18next';

import { getBuiltInToolDisplay } from '@/frontend/components/Message';

// Exact runtime names from the PC Pi, DSH and Claude tool catalogs. These are display labels only.
const titleKeys = new Map<string, string>([
  ['read', 'chat.builtinTool.file.read'],
  ['Read', 'chat.builtinTool.file.read'],
  ['write', 'chat.builtinTool.file.write'],
  ['Write', 'chat.builtinTool.file.write'],
  ['edit', 'chat.builtinTool.file.edit'],
  ['Edit', 'chat.builtinTool.file.edit'],
  ['MultiEdit', 'chat.builtinTool.file.edit'],
  ['bash', 'remoteAgent.tool.runCommand'],
  ['Bash', 'remoteAgent.tool.runCommand'],
  ['pwsh', 'remoteAgent.tool.runCommand'],
  ['Glob', 'remoteAgent.tool.findFiles'],
  ['Grep', 'remoteAgent.tool.searchFiles'],
  ['read_image', 'remoteAgent.tool.readImage'],
  ['NotebookRead', 'remoteAgent.tool.readNotebook'],
  ['NotebookEdit', 'remoteAgent.tool.editNotebook'],
  ['WebSearch', 'chat.builtinTool.web.search'],
  ['WebFetch', 'chat.builtinTool.web.fetch'],
  ['todo_write', 'remoteAgent.tool.updateTodos'],
  ['TodoWrite', 'remoteAgent.tool.updateTodos'],
  ['skill', 'remoteAgent.tool.useSkill'],
  ['Skill', 'remoteAgent.tool.useSkill'],
  ['get_goal', 'remoteAgent.tool.getGoal'],
  ['create_goal', 'remoteAgent.tool.createGoal'],
  ['update_goal', 'remoteAgent.tool.updateGoal'],
  ['subagent', 'remoteAgent.tool.runAgent'],
  ['subagent_fork', 'remoteAgent.tool.runAgent'],
  ['Task', 'remoteAgent.tool.runAgent'],
  ['Agent', 'remoteAgent.tool.runAgent'],
  ['send_message', 'remoteAgent.tool.sendMessage'],
  ['SendMessage', 'remoteAgent.tool.sendMessage'],
  ['interrupt_agent', 'remoteAgent.tool.interruptAgent'],
  ['list_agents', 'remoteAgent.tool.listAgents'],
  ['exit_plan_mode', 'remoteAgent.tool.exitPlanMode'],
  ['ExitPlanMode', 'remoteAgent.tool.exitPlanMode'],
  ['AskUserQuestion', 'remoteAgent.tool.askUser'],
  ['tool_search', 'chat.metaToolSearch.title'],
  ['ToolSearch', 'chat.metaToolSearch.title'],
  ['tool_describe', 'chat.metaToolInspect.title'],
  ['tool_inspect', 'chat.metaToolInspect.title'],
  ['tool_call', 'chat.metaToolInvoke.title'],
  ['tool_invoke', 'chat.metaToolInvoke.title'],
  ['tool_exec', 'chat.metaToolExec.title'],
]);

export function getConversationToolTitle(name: string | undefined, t: TFunction): string {
  if (!name) return t('remoteAgent.details');
  const titleKey = titleKeys.get(name) ?? getBuiltInToolDisplay(name)?.titleKey;
  // Preserve custom/MCP identities; do not strip namespaces or guess from a matching suffix.
  return titleKey ? t(titleKey) : name;
}
