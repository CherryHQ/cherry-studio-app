import type { ServiceConstructor } from '../lifecycle/types';
import { application } from './Application';
import { ApplicationHost, type HostProfile } from './ApplicationHost';

/**
 * Install a host for one test case.
 *
 * Test-only, but it lives beside the production code it drives rather than in a
 * `__tests__` directory, matching `serviceTestDatabase.ts`: suites all over the
 * backend import it, and cross-directory imports out of a `__tests__` folder
 * read as an accident.
 *
 * Data services resolve `application.get('DbService')` per call, so a suite that
 * forgets to install a host gets a loud throw naming the service rather than a
 * silently stale instance.
 *
 * **Nothing is registered by default.** The host serves the overrides and holds
 * no real services, so a unit test does not start MMKV, open a database, or load
 * preferences just to exercise one query builder. Overrides bypass construction
 * and receive no lifecycle callbacks, so a duck-typed fake does not have to
 * extend `BaseService`. Pass `serviceList` explicitly when a test genuinely
 * wants the production graph.
 *
 * ```ts
 * beforeEach(async () => {
 *   ({ dbService } = createServiceTestDatabase());
 *   await installTestHost({ DbService: dbService });
 * });
 * afterEach(uninstallTestHost);
 * ```
 */
export async function installTestHost(
  overrides: NonNullable<HostProfile['overrides']> = {},
  services: readonly ServiceConstructor[] = [],
): Promise<ApplicationHost> {
  const host = new ApplicationHost({ overrides, services });
  await application.install(host);
  return host;
}

/**
 * Tear the host down between cases.
 *
 * Always call this, even when the case installed nothing: `application` is a
 * module constant, so a host left installed leaks into the next case in the same
 * worker and turns an unrelated failure into a mystery.
 */
export function uninstallTestHost(): Promise<unknown> {
  return application.uninstall();
}
