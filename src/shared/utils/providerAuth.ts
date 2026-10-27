import type { AuthConfig } from '@/shared/data/types/provider';

/**
 * Whether a Provider may send requests without an API key. A stored api-key `required` flag is the
 * user's answer; without one the registry preset decides.
 */
export function resolveAuthOptional(
  authConfig: AuthConfig | null | undefined,
  presetAuthOptional: boolean | undefined,
): boolean | undefined {
  return authConfig?.type === 'api-key' && authConfig.required !== undefined
    ? !authConfig.required
    : presetAuthOptional;
}
