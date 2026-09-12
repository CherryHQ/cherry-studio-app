/**
 * Provider configuration and auth — mobile-owned, still declared in `packages/universal`.
 *
 * `packages/ai-runtime` imports this module and a workspace package must not
 * import app code, so the declarations cannot move yet. App code imports this
 * path — the final home — so dissolving universal is a paste into this file
 * rather than another import migration, and until then there is exactly one
 * declaration rather than two copies that can drift.
 */
export * from '@cherrystudio/universal/data/types/provider';
