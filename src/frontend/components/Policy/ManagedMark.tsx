import { LockedMark } from '@cherrystudio/ui/components';

import { withPolicy } from './withPolicy';

// Resolved at render: tests replace parts of CherryUI, so nothing here reads it at module load.
function Mark() {
  return <LockedMark />;
}

/**
 * The organization's mark after the name of an Agent, Skill, MCP server or settings page the
 * enterprise server delivers. Elsewhere it renders nothing.
 */
export const ManagedMark = withPolicy(Mark, (policy) => (policy.managed ? {} : null));
