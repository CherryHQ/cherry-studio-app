import * as z from 'zod';

/** Server-authored data, displayed as untrusted content with an explicit source. */
export const McpElicitationSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('url'), message: z.string().max(4000), url: z.url().max(8192) }),
  z.object({
    mode: z.literal('form'),
    message: z.string().max(4000),
    requestedSchema: z.object({
      type: z.literal('object'),
      properties: z.record(z.string(), z.record(z.string(), z.unknown())),
      required: z.array(z.string()).optional(),
    }),
  }),
]);
export type McpElicitation = z.infer<typeof McpElicitationSchema>;
export type McpPendingElicitation = {
  id: string;
  serverId: string;
  serverName: string;
  endpointUrl: string;
  request: McpElicitation;
  toolApproval?: { name: string; arguments: Record<string, unknown> };
};
export type McpElicitationResponse = {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, string | number | boolean | string[]>;
};

export function validateMcpElicitationResponse(
  request: McpElicitation,
  response: McpElicitationResponse,
): void {
  if (!['accept', 'decline', 'cancel'].includes(response.action))
    throw new Error('Invalid action.');
  if (response.action !== 'accept' || request.mode === 'url') {
    if (response.content !== undefined) throw new Error('Unexpected form content.');
    return;
  }
  const schema = z.fromJSONSchema({
    ...request.requestedSchema,
    additionalProperties: false,
  } as Parameters<typeof z.fromJSONSchema>[0]);
  if (!schema.safeParse(response.content ?? {}).success) throw new Error('Invalid form values.');
}
