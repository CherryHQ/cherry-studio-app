import { createIcon } from '../createIcon';

/**
 * FolderOpenIcon — SF `folder` / Material `folder_open` (was lucide `folder-open`).
 * DRIFT: SF Symbols has no open-folder variant; iOS falls back to the closed folder.
 */
export default createIcon({ displayName: 'FolderOpenIcon', sf: 'folder', glyph: '\ue2c8' });
