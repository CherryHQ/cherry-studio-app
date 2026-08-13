import { createIcon } from '../createIcon';

/**
 * MonitorCloudIcon — SF `externaldrive.badge.icloud` / Material `backup` (was lucide `monitor-cloud`).
 * DRIFT: Heaviest drift: no monitor+cloud combo exists. Mapped to the cloud-backup metaphor its call site (settings data screen) actually means.
 */
export default createIcon({
  displayName: 'MonitorCloudIcon',
  sf: 'externaldrive.badge.icloud',
  glyph: '\ue864',
});
