import {
  directEndpointSchema,
  directEndpointUrl,
  remoteDiscoveryTxtSchema,
  type DirectEndpoint,
} from '@cherrystudio/remote-protocol';

type RecordEntry = { identity: string; endpoints: DirectEndpoint[]; expiresAt: number };
export type DiscoveryEvent =
  | { type: 'network' }
  | { type: 'unavailable' }
  | { type: 'remove'; id: string }
  | { type: 'service'; id: string; txt: Record<string, string>; hosts: string[]; port: number };

/** Addresses are disposable hints. None of these maps contain authorization or durable state. */
export class DesktopEndpointResolver {
  discoveryAvailable = true;
  private readonly services = new Map<string, RecordEntry>();
  private readonly hints = new Map<string, RecordEntry>();
  private readonly failures = new Map<string, string[]>();
  private readonly successes = new Map<string, string>();
  private readonly listeners = new Set<(networkChanged: boolean) => void>();

  subscribe(listener: (networkChanged: boolean) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  accept(event: DiscoveryEvent) {
    if (event.type === 'network') {
      this.services.clear();
      this.hints.clear();
      this.successes.clear();
      this.failures.clear();
    } else if (event.type === 'unavailable') {
      this.discoveryAvailable = false;
    } else if (event.type === 'remove') {
      this.services.delete(event.id);
    } else {
      const txt = remoteDiscoveryTxtSchema.safeParse(event.txt);
      if (!txt.success || event.id.length > 512) return;
      this.prune();
      if (!this.services.has(event.id) && this.services.size >= 128) return;
      const endpoints = event.hosts.slice(0, 16).flatMap((host) => {
        // Scoped link-local IPv6 is not portable across the RN WebSocket implementations.
        if (/^fe[89ab][0-9a-f]:/i.test(host) || host.includes('%')) return [];
        const parsed = directEndpointSchema.safeParse({ host, port: event.port, security: 'ws' });
        return parsed.success ? [parsed.data] : [];
      });
      this.services.set(event.id, {
        identity: txt.data.identity,
        endpoints,
        expiresAt: Date.now() + 60_000,
      });
      this.discoveryAvailable = true;
    }
    for (const listener of this.listeners) listener(event.type === 'network');
  }

  seed(id: string, identity: string, endpoints: DirectEndpoint[]) {
    this.prune();
    if (!this.hints.has(id) && this.hints.size >= 128)
      this.hints.delete(this.hints.keys().next().value!);
    this.hints.set(id, {
      identity,
      endpoints: endpoints.slice(0, 16).map((value) => directEndpointSchema.parse(value)),
      expiresAt: Date.now() + 300_000,
    });
    for (const listener of this.listeners) listener(false);
  }

  candidates(id: string, identity: string, configured: DirectEndpoint[]): DirectEndpoint[] {
    this.prune();
    const hint = this.hints.get(id);
    const automatic = [...this.services.values()]
      .filter((record) => record.identity === identity)
      .flatMap((record) => record.endpoints)
      .slice(0, 16);
    const candidates = [
      ...(hint?.identity === identity ? hint.endpoints : []),
      ...configured,
      ...automatic.slice(0, 16 - (hint?.identity === identity ? hint.endpoints.length : 0)),
    ];
    const unique = [
      ...new Map(candidates.map((endpoint) => [directEndpointUrl(endpoint), endpoint])).values(),
    ];
    const successful = this.successes.get(id);
    const failures = this.failures.get(id) ?? [];
    return unique.sort(
      (a, b) =>
        Number(directEndpointUrl(b) === successful) - Number(directEndpointUrl(a) === successful) ||
        failures.indexOf(directEndpointUrl(a)) - failures.indexOf(directEndpointUrl(b)),
    );
  }

  failed(id: string, endpoint: DirectEndpoint) {
    const key = directEndpointUrl(endpoint);
    if (this.failures.size >= 128 && !this.failures.has(id))
      this.failures.delete(this.failures.keys().next().value!);
    this.failures.set(
      id,
      [...(this.failures.get(id) ?? []).filter((value) => value !== key), key].slice(-24),
    );
    if (this.successes.get(id) === key) this.successes.delete(id);
  }

  succeeded(id: string, endpoint: DirectEndpoint) {
    if (this.successes.size >= 128) this.successes.delete(this.successes.keys().next().value!);
    this.successes.set(id, directEndpointUrl(endpoint));
  }

  forget(id: string) {
    this.hints.delete(id);
    this.successes.delete(id);
    this.failures.delete(id);
  }

  private prune() {
    for (const records of [this.services, this.hints])
      for (const [id, record] of records) if (record.expiresAt <= Date.now()) records.delete(id);
  }
}
