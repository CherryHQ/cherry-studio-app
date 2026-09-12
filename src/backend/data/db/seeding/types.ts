import type { DbService } from '../DbService';

export type DatabaseSeeder = {
  /** Unique identifier for seed journal tracking (stored as `seed:<name>` in app_state). */
  readonly name: string;
  /** Version string for change detection. */
  readonly version: string;
  /** Human-readable description for logging. */
  readonly description: string;
  /** Execute the seed operation. */
  run: (dbService: DbService) => Promise<void>;
};
