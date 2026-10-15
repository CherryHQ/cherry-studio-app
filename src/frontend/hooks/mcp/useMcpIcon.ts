import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { useUniwind } from 'uniwind';

/** The MCP brand icon for the current color scheme. */
export function useMcpIcon() {
  const { theme } = useUniwind();
  return resolveProviderIcon('mcp')?.[theme === 'dark' ? 'dark' : 'light'];
}
