import { DesktopEndpointResolver } from '../DesktopEndpointResolver';

const endpoint = { host: '10.0.0.2', port: 23333, security: 'ws' as const };
const record = {
  type: 'service' as const,
  id: 'desktop.local',
  txt: { v: '1', identity: 'peer1' },
  hosts: [endpoint.host],
  port: endpoint.port,
};

describe('desktop location hints', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('filters untrusted identities, validates bounds and deduplicates configured paths', () => {
    const resolver = new DesktopEndpointResolver();
    resolver.accept(record);
    resolver.accept({
      ...record,
      id: 'wrong',
      txt: { v: '1', identity: 'other' },
      hosts: ['10.0.0.3'],
    });
    resolver.accept({ ...record, id: 'bad', hosts: ['fe80::1%en0', 'http://evil/path'], port: -1 });
    expect(resolver.candidates('device', 'peer1', [endpoint])).toEqual([endpoint]);
    resolver.accept({ type: 'remove', id: record.id });
    expect(resolver.candidates('device', 'peer1', [endpoint])).toEqual([endpoint]);
    expect(resolver.candidates('device', 'peer1', [])).toEqual([]);
  });

  it('replaces advertised ports and expires automatic locations without extending them on success', () => {
    const resolver = new DesktopEndpointResolver();
    resolver.accept(record);
    resolver.accept({ ...record, port: 24444 });
    expect(resolver.candidates('device', 'peer1', [])).toEqual([{ ...endpoint, port: 24444 }]);
    resolver.succeeded('device', { ...endpoint, port: 24444 });
    jest.advanceTimersByTime(60_000);
    expect(resolver.candidates('device', 'peer1', [])).toEqual([]);
  });

  it('discards QR hints and successes on network changes while preserving explicit hostnames', () => {
    const resolver = new DesktopEndpointResolver();
    const configured = { ...endpoint, host: 'desktop.example' };
    resolver.seed('device', 'peer1', [endpoint]);
    resolver.accept(record);
    resolver.succeeded('device', endpoint);
    expect(resolver.candidates('device', 'peer1', [configured])).toEqual([endpoint, configured]);
    resolver.accept({ type: 'network' });
    expect(resolver.candidates('device', 'peer1', [configured])).toEqual([configured]);
    resolver.seed('device', 'peer1', [endpoint]);
    jest.advanceTimersByTime(300_000);
    expect(resolver.candidates('device', 'peer1', [])).toEqual([]);
  });

  it('rotates recently failed candidates so a short round cannot starve later configured addresses', () => {
    const resolver = new DesktopEndpointResolver();
    const endpoints = [
      endpoint,
      { ...endpoint, host: '10.0.0.3' },
      { ...endpoint, host: '10.0.0.4' },
    ];
    resolver.failed('device', endpoints[0]);
    resolver.failed('device', endpoints[1]);
    expect(resolver.candidates('device', 'peer1', endpoints)).toEqual([
      endpoints[2],
      endpoints[0],
      endpoints[1],
    ]);
    resolver.succeeded('device', endpoints[2]);
    expect(resolver.candidates('device', 'peer1', endpoints)[0]).toEqual(endpoints[2]);
    resolver.accept({ type: 'network' });
    expect(resolver.candidates('device', 'peer1', endpoints)).toEqual(endpoints);
  });

  it('bounds discovery flooding without evicting manually configured routes', () => {
    const resolver = new DesktopEndpointResolver();
    for (let i = 0; i < 200; i++) resolver.accept({ ...record, id: String(i), port: i + 1 });
    expect(resolver.candidates('device', 'peer1', [endpoint])).toHaveLength(17);
    expect(resolver.candidates('device', 'peer1', [endpoint])[0]).toEqual(endpoint);
  });
});
