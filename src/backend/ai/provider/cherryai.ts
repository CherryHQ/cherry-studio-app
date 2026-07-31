import { Hex, HmacSHA256 } from 'crypto-es';

const CLIENT_ID = 'cherry-studio';
const CLIENT_SECRET_SUFFIX = 'GvI6I5ZrEHcGOWjO5AKhJKGmnwwGfM62XKpWqkjhvzRU2NZIinM77aTGIqhqys0g';

function getClientSecret() {
  return `${process.env.EXPO_PUBLIC_CHERRYAI_CLIENT_SECRET ?? ''}.${CLIENT_SECRET_SUFFIX}`;
}

export interface SignatureOptions {
  body?: Record<string, unknown> | string;
  method: string;
  path: string;
  query?: string;
}

export interface SignatureHeaders {
  'X-Client-ID': string;
  'X-Signature': string;
  'X-Timestamp': string;
}

export class SignatureClient {
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(clientId = CLIENT_ID, clientSecret = getClientSecret()) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  generateSignature(options: SignatureOptions): SignatureHeaders {
    const { body = '', method, path, query = '' } = options;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyString = formatSignatureBody(body);
    const signatureString = [
      method.toUpperCase(),
      path,
      query,
      this.clientId,
      timestamp,
      bodyString,
    ].join('\n');
    const signature = HmacSHA256(signatureString, this.clientSecret).toString(Hex);

    return {
      'X-Client-ID': this.clientId,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    };
  }
}

let signatureClient: SignatureClient | null = null;

export function generateSignature(options: SignatureOptions): SignatureHeaders {
  signatureClient ??= new SignatureClient();
  return signatureClient.generateSignature(options);
}

function formatSignatureBody(body: SignatureOptions['body']): string {
  if (!body) {
    return '';
  }

  return typeof body === 'object' ? JSON.stringify(body) : body.toString();
}
