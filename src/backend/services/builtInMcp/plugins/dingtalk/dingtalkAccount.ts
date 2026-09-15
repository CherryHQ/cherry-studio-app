import * as z from 'zod';

import { createOfficialMcpClient } from '../../transport/createOfficialMcpClient';
import { DingtalkAccountSchema, type DingtalkUserCredential } from './dingtalkCredentials';
import { readDingtalkPermission } from './dingtalkPermission';
import { DINGTALK_SERVICES } from './dingtalkTools';

const ProfileSchema = z.object({
  result: z.array(
    z.object({
      orgEmployeeModel: z.object({
        corpId: z.string().optional(),
        orgName: z.string().optional(),
        userId: z.string().optional(),
        userid: z.string().optional(),
        orgUserId: z.string().optional(),
        orgUserName: z.string().optional(),
        name: z.string().optional(),
      }),
    }),
  ),
});
const ToolResultSchema = z.object({
  isError: z.boolean().optional(),
  structuredContent: z.unknown().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
});

/** Best-effort display/identity enrichment; absent contact access is valid for external workers. */
export async function enrichDingtalkAccount(
  credential: DingtalkUserCredential,
  signal: AbortSignal,
) {
  if (credential.account.userId) return credential;
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  let client;
  try {
    client = await createOfficialMcpClient(
      {
        pluginId: 'dingtalk',
        tools: { get_current_user_profile: 'read' },
        signal: requestSignal,
        getCredential: async () => JSON.parse(JSON.stringify(credential)),
        assertAuthorized: async () => {
          requestSignal.throwIfAborted();
        },
        authorization: {
          apply(_value, { headers }) {
            headers.set('Authorization', `Bearer ${credential.tokens.accessToken}`);
            headers.set('x-user-access-token', credential.tokens.accessToken);
            headers.set('claw-type', 'openClaw');
          },
        },
      },
      { url: `https://mcp-gw.dingtalk.com${DINGTALK_SERVICES.contact.path}` },
    );
    const output = await client.callTool({
      name: 'get_current_user_profile',
      args: {},
      options: { abortSignal: requestSignal },
    });
    if (readDingtalkPermission(output)) return credential;
    const result = ToolResultSchema.parse(output);
    if (result.isError) return credential;
    const values: unknown[] = [result.structuredContent];
    for (const item of result.content ?? []) {
      if (item.type === 'text' && item.text && item.text.length <= 65_536) {
        try {
          values.push(JSON.parse(item.text));
        } catch {
          /* A text block need not be JSON. */
        }
      }
    }
    for (const value of values) {
      const parsed = ProfileSchema.safeParse(value);
      if (!parsed.success) continue;
      const records = parsed.data.result.map((item) => item.orgEmployeeModel);
      const org =
        records.find((item) => item.corpId === credential.account.corpId) ??
        (records.length === 1 && !records[0]!.corpId ? records[0] : undefined);
      if (!org) continue;
      const account = DingtalkAccountSchema.safeParse({
        ...credential.account,
        userId: org.userId || org.userid || org.orgUserId,
        userName: org.orgUserName || org.name,
        corpName: org.orgName || credential.account.corpName,
      });
      if (account.success) return { ...credential, account: account.data };
    }
  } catch {
    /* Contact access is optional; never expose its response as authorization diagnostics. */
  } finally {
    await client?.close().catch(() => {});
  }
  signal.throwIfAborted();
  return credential;
}
