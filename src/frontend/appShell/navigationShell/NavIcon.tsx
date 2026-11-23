import type { LucideIconComponent } from '@cherrystudio/app-icons';
import BoxesIcon from '@cherrystudio/app-icons/icons/boxes';
import BoxesFilledIcon from '@cherrystudio/app-icons/icons/boxes-filled';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import FolderFilledIcon from '@cherrystudio/app-icons/icons/folder-filled';
import LayoutGridIcon from '@cherrystudio/app-icons/icons/layout-grid';
import LayoutGridFilledIcon from '@cherrystudio/app-icons/icons/layout-grid-filled';
import MessageCircleIcon from '@cherrystudio/app-icons/icons/message-circle';
import MessageCircleFilledIcon from '@cherrystudio/app-icons/icons/message-circle-filled';
import MousePointerClickIcon from '@cherrystudio/app-icons/icons/mouse-pointer-click';
import MousePointerClickFilledIcon from '@cherrystudio/app-icons/icons/mouse-pointer-click-filled';
import NetworkIcon from '@cherrystudio/app-icons/icons/network';
import NetworkFilledIcon from '@cherrystudio/app-icons/icons/network-filled';
import PaletteIcon from '@cherrystudio/app-icons/icons/palette';
import PaletteFilledIcon from '@cherrystudio/app-icons/icons/palette-filled';
import StoreIcon from '@cherrystudio/app-icons/icons/store';
import StoreFilledIcon from '@cherrystudio/app-icons/icons/store-filled';
import type { ReactElement } from 'react';

import type { NavTabId } from './navRouteManifest';

type DualStateIconEntry = {
  filled: LucideIconComponent;
  outline: LucideIconComponent;
};

const NAV_ICON_BY_TAB = {
  chat: { filled: MessageCircleFilledIcon, outline: MessageCircleIcon },
  agents: { filled: MousePointerClickFilledIcon, outline: MousePointerClickIcon },
  more: { filled: LayoutGridFilledIcon, outline: LayoutGridIcon },
  drawings: { filled: PaletteFilledIcon, outline: PaletteIcon },
  plugins: { filled: BoxesFilledIcon, outline: BoxesIcon },
  marketplace: { filled: StoreFilledIcon, outline: StoreIcon },
  files: { filled: FolderFilledIcon, outline: FolderIcon },
  devices: { filled: NetworkFilledIcon, outline: NetworkIcon },
} as const satisfies Record<NavTabId, DualStateIconEntry>;

type NavIconProps = {
  className?: string;
  color?: string;
  filled?: boolean;
  id: NavTabId;
  size?: number;
  strokeWidth?: number;
};

/** Dual-state (outline vs filled) navigation glyph backed by `@cherrystudio/app-icons`. */
export function NavIcon({
  className,
  color,
  filled = false,
  id,
  size,
  strokeWidth = 1.85,
}: NavIconProps): ReactElement {
  const entry = NAV_ICON_BY_TAB[id];
  const Icon = filled ? entry.filled : entry.outline;

  return <Icon className={className} color={color} size={size} strokeWidth={strokeWidth} />;
}
