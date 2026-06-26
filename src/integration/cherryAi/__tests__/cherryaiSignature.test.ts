import { SignatureClient } from '../index';

describe('CherryAI signature', () => {
  const dateNow = jest.spyOn(Date, 'now');

  afterEach(() => {
    dateNow.mockReset();
  });

  afterAll(() => {
    dateNow.mockRestore();
  });

  it('generates desktop-compatible HMAC headers for object bodies', () => {
    dateNow.mockReturnValue(1_700_000_000_000);

    const client = new SignatureClient('test-client', 'test-secret');
    const headers = client.generateSignature({
      method: 'post',
      path: '/chat/completions',
      body: {
        messages: [{ content: 'hi', role: 'user' }],
        model: 'glm',
      },
    });

    expect(headers).toEqual({
      'X-Client-ID': 'test-client',
      'X-Timestamp': '1700000000',
      'X-Signature': '3a259730977719f1bbcc68cb1976ca3c1539a1d19f198405add39201b81eeea0',
    });
  });

  it('keeps string bodies verbatim in the signature payload', () => {
    dateNow.mockReturnValue(1_700_000_000_000);

    const client = new SignatureClient('test-client', 'test-secret');
    const headers = client.generateSignature({
      method: 'POST',
      path: '/chat/completions',
      body: '{"model":"glm","messages":[{"role":"user","content":"hi"}]}',
    });

    expect(headers['X-Signature']).toBe(
      '6e10ff18254d97a7b351ce45583733a95d8588825292292d45664ac3bdd3dd6a',
    );
  });
});
