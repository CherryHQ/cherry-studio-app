import { createSignatureGenerator } from '@cherrystudio/ai-runtime/provider';

describe('CherryAI signature adapter', () => {
  const originalSecret = process.env.EXPO_PUBLIC_CHERRYAI_CLIENT_SECRET;

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    process.env.EXPO_PUBLIC_CHERRYAI_CLIENT_SECRET = originalSecret;
  });

  it('injects the Expo public client secret into the portable generator', () => {
    process.env.EXPO_PUBLIC_CHERRYAI_CLIENT_SECRET = 'public-secret';
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const options = { method: 'POST', path: '/chat/completions' };
    let headers: ReturnType<ReturnType<typeof createSignatureGenerator>> | undefined;
    jest.isolateModules(() => {
      const { generateSignature } = jest.requireActual(
        '../cherryai',
      ) as typeof import('../cherryai');
      headers = generateSignature(options);
    });

    expect(headers).toEqual(createSignatureGenerator('public-secret')(options));
  });
});
