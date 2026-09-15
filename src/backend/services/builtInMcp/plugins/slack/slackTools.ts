import type { PluginToolPolicy } from '../../pluginDefinition';

// Explicit admission and effects for Slack's hosted catalog; discovery owns schemas and results.
// https://docs.slack.dev/ai/slack-mcp-server/
export const SLACK_TOOL_POLICY = {
  slack_search_public: 'read',
  slack_search_public_and_private: 'read',
  slack_search_channels: 'read',
  slack_search_users: 'read',
  slack_search_emojis: 'read',
  slack_read_channel: 'read',
  slack_read_thread: 'read',
  slack_read_user_profile: 'read',
  slack_read_file: 'read',
  slack_list_channel_members: 'read',
  slack_list_user_channels: 'read',
  slack_get_reactions: 'read',
  slack_read_canvas: 'read',
  slack_read_list: 'read',
  slack_send_message: 'write',
  slack_send_message_draft: 'write',
  slack_schedule_message: 'write',
  slack_create_conversation: 'write',
  slack_add_reaction: 'write',
  slack_create_canvas: 'write',
  slack_update_canvas: 'write',
  slack_create_list: 'write',
  slack_update_list: 'write',
  slack_add_list_record: 'write',
  slack_update_list_record: 'write',
} as const satisfies PluginToolPolicy;
