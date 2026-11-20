import { signCloudRequest } from '../../../../modules/cloud-signing';

const CLIENT_ID = 'cherry-studio';

/** Cloud application HMAC uses the final request text and an unmodified native UTF-8 key. */
export async function cloudClientSignatureHeaders(
  method: string,
  target: string,
  body: string,
): Promise<Record<string, string>> {
  const queryStart = target.indexOf('?');
  const path = queryStart < 0 ? target : target.slice(0, queryStart);
  const rawQuery = queryStart < 0 ? '' : target.slice(queryStart + 1);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await signCloudRequest(
    [method.toUpperCase(), path, rawQuery, CLIENT_ID, timestamp, body].join('\n'),
  );
  return signature
    ? { 'X-Client-ID': CLIENT_ID, 'X-Timestamp': timestamp, 'X-Signature': signature }
    : {};
}
