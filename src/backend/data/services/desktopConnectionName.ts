import type { DesktopConnectionRow } from '@/backend/data/db/schemas';

/** Local aliases are literal; only desktop hostnames lose their network domain. */
export function desktopConnectionName({
  alias,
  name,
}: Pick<DesktopConnectionRow, 'alias' | 'name'>): string {
  if (alias !== null) return alias;
  const match = /^([a-z0-9-]*[a-z][a-z0-9-]*)(\.[a-z0-9-]+)+$/i.exec(name);
  return match ? match[1] : name;
}
