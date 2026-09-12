/**
 * Compile-time job type directory.
 *
 * Keep aligned with desktop src/main/core/job/jobRegistry.ts.
 *
 * Business modules use TypeScript declaration merging to register their
 * `type -> payload` mapping:
 *
 *   declare module '@/backend/services/jobs/jobRegistry' {
 *     interface JobRegistry {
 *       'painting.generate': PaintingGenerateInput;
 *     }
 *   }
 *
 * After the declaration, `jobRuntime.enqueue('painting.generate', input)` is
 * compile-time checked. The runtime handler map is independent of this
 * interface — merging a type here does not register a handler.
 */
// oxlint-disable-next-line no-empty-interface -- declaration-merging anchor
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration-merging anchor
export interface JobRegistry {}

export type JobType = keyof JobRegistry & string;

export type JobPayloadOf<K extends JobType> = JobRegistry[K];
