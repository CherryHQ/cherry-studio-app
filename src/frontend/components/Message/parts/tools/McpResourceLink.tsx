import { Button } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { Text } from 'react-native';

import { useMcpAppConversation } from '@/frontend/components/McpApp';
import { McpContentPicker } from '@/frontend/components/McpContent';
import type { McpResourceReference, McpResultSource } from '@/shared/contracts/mcpContent';

/** User-opened resource previews use the original MCP authority, including for HTTPS URIs. */
export function McpResourceLink({
  source,
  uri,
  label,
}: {
  source: McpResultSource;
  uri: string;
  label: string;
}) {
  const conversation = useMcpAppConversation();
  const [resource, setResource] = useState<McpResourceReference>();
  // Imported local artifacts already have their own file cards; never send their refs to a server.
  if (!conversation || uri.startsWith('cherry://file/'))
    return (
      <Text className="text-base text-foreground" selectable>
        {label}
      </Text>
    );
  return (
    <>
      <Button size="sm" variant="secondary" onPress={() => setResource({ source, uri })}>
        {label}
      </Button>
      {resource ? (
        <McpContentPicker resource={resource} onClose={() => setResource(undefined)} />
      ) : null}
    </>
  );
}
