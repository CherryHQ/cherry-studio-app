import type { LucideIconComponent } from '@cherrystudio/app-icons';
import NavAgentsIcon from '@cherrystudio/app-icons/icons/nav-agents';
import NavAgentsFilledIcon from '@cherrystudio/app-icons/icons/nav-agents-filled';
import NavChatIcon from '@cherrystudio/app-icons/icons/nav-chat';
import NavChatFilledIcon from '@cherrystudio/app-icons/icons/nav-chat-filled';
import NavDevicesIcon from '@cherrystudio/app-icons/icons/nav-devices';
import NavDevicesFilledIcon from '@cherrystudio/app-icons/icons/nav-devices-filled';
import NavDrawingsIcon from '@cherrystudio/app-icons/icons/nav-drawings';
import NavDrawingsFilledIcon from '@cherrystudio/app-icons/icons/nav-drawings-filled';
import NavFilesIcon from '@cherrystudio/app-icons/icons/nav-files';
import NavFilesFilledIcon from '@cherrystudio/app-icons/icons/nav-files-filled';
import NavMarketplaceIcon from '@cherrystudio/app-icons/icons/nav-marketplace';
import NavMarketplaceFilledIcon from '@cherrystudio/app-icons/icons/nav-marketplace-filled';
import NavMoreIcon from '@cherrystudio/app-icons/icons/nav-more';
import NavMoreFilledIcon from '@cherrystudio/app-icons/icons/nav-more-filled';
import NavPluginsIcon from '@cherrystudio/app-icons/icons/nav-plugins';
import NavPluginsFilledIcon from '@cherrystudio/app-icons/icons/nav-plugins-filled';
import type { ReactElement } from 'react';

import type { NavTabId } from './navRouteManifest';

type DualStateIconEntry = {
  filled: LucideIconComponent;
  outline: LucideIconComponent;
};

const NAV_ICON_BY_TAB = {
  chat: { filled: NavChatFilledIcon, outline: NavChatIcon },
  agents: { filled: NavAgentsFilledIcon, outline: NavAgentsIcon },
  more: { filled: NavMoreFilledIcon, outline: NavMoreIcon },
  drawings: { filled: NavDrawingsFilledIcon, outline: NavDrawingsIcon },
  plugins: { filled: NavPluginsFilledIcon, outline: NavPluginsIcon },
  marketplace: { filled: NavMarketplaceFilledIcon, outline: NavMarketplaceIcon },
  files: { filled: NavFilesFilledIcon, outline: NavFilesIcon },
  devices: { filled: NavDevicesFilledIcon, outline: NavDevicesIcon },
} as const satisfies Record<NavTabId, DualStateIconEntry>;

type NavIconProps = {
  className?: string;
  color?: string;
  filled?: boolean;
  id: NavTabId;
  size?: number;
  strokeWidth?: number;
};

/** Dual-state (outline vs filled) rounded navigation glyph backed by `@cherrystudio/app-icons`. */
export function NavIcon({
  className,
  color,
  filled = false,
  id,
  size,
  strokeWidth = 2,
}: NavIconProps): ReactElement {
  const entry = NAV_ICON_BY_TAB[id];
  const Icon = filled ? entry.filled : entry.outline;

  return <Icon className={className} color={color} size={size} strokeWidth={strokeWidth} />;
}
