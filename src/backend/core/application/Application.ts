import type { TeardownSummary } from '../lifecycle/types';
import type { ApplicationHost } from './ApplicationHost';
import type { ServiceRegistry } from './serviceRegistry';

/**
 * The stable reference every service resolves through.
 *
 * `application` never changes identity; the `ApplicationHost` behind it does.
 * That indirection is what lets a CRUD module singleton hold no state — it
 * resolves the *current* host's `DbService` on every call — and what lets a test
 * swap the entire graph without touching the code under test.
 *
 * Import this module directly rather than through a barrel. Desktop's
 * `@application` alias points straight at its `Application.ts` for the same
 * reason: a barrel that also re-exported the registry would drag the whole
 * service graph into every consumer and close an import cycle.
 */
class Application {
  private host: ApplicationHost | null = null;

  /** Serializes install/uninstall so two generations never overlap. */
  private transition: Promise<unknown> = Promise.resolve();

  /**
   * Resolve a service from the installed host.
   *
   * Throws when no host is installed, which is deliberate: it turns a
   * module-scope `application.get()` — evaluated at import time, before any host
   * exists — into a loud failure instead of a silently captured stale instance.
   *
   * There is no readiness gate. Resolution during host startup is normal
   * (services are created lazily) and resolution during disposal is normal
   * (`onStop` reaches its collaborators). Correctness for late callbacks comes
   * from scope fencing and write-path guards, not from making every call site
   * defensive.
   */
  get<K extends keyof ServiceRegistry>(name: K): ServiceRegistry[K] {
    if (!this.host) {
      throw new Error(
        `[Application] Cannot resolve '${String(name)}': no ApplicationHost is installed. ` +
          `Resolve services inside a method rather than at module scope, and install a test host in tests.`,
      );
    }
    return this.host.container.get<ServiceRegistry[K]>(name as string);
  }

  /**
   * Install a host, replacing any current one.
   *
   * The outgoing host is disposed to completion before the incoming one starts,
   * so a database connection or job claim is never held by two generations at
   * once. Concurrent calls queue rather than interleave.
   *
   * If `start()` rejects, no host is installed and the error propagates.
   */
  async install(host: ApplicationHost): Promise<void> {
    await this.enqueue(async () => {
      const outgoing = this.host;
      this.host = null;
      if (outgoing) {
        await outgoing.dispose();
      }

      await host.start();
      this.host = host;
    });
  }

  /** Dispose the installed host. Returns an empty summary when none is installed. */
  async uninstall(): Promise<TeardownSummary> {
    let summary: TeardownSummary = { failed: [], timedOut: [] };

    await this.enqueue(async () => {
      const outgoing = this.host;
      this.host = null;
      if (outgoing) {
        summary = await outgoing.dispose();
      }
    });

    return summary;
  }

  get hasHost(): boolean {
    return this.host !== null;
  }

  /** The installed host. For bootstrap and tests; services use `get()`. */
  get current(): ApplicationHost | null {
    return this.host;
  }

  private async enqueue(work: () => Promise<void>): Promise<void> {
    const previous = this.transition;
    let release: () => void = () => {};
    this.transition = new Promise<void>((resolve) => {
      release = resolve;
    });

    // A failed predecessor must not poison the queue — it already reported to
    // its own caller.
    await previous.catch(() => {});

    try {
      await work();
    } finally {
      release();
    }
  }
}

export const application = new Application();

export type { Application };
