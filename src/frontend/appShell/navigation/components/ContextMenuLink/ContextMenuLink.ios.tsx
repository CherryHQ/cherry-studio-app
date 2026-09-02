import { Link } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import type { ContextMenuLinkProps } from './ContextMenuLink.types';

const PREVIEW_HORIZONTAL_INSET = 32;
const PREVIEW_MAX_SIZE = 420;

export function ContextMenuLink({ children, href, items, preview = true }: ContextMenuLinkProps) {
  const { width: windowWidth } = useWindowDimensions();
  const previewSize = Math.max(
    0,
    Math.min(windowWidth - PREVIEW_HORIZONTAL_INSET, PREVIEW_MAX_SIZE),
  );

  return (
    <Link asChild href={href}>
      <Link.Trigger>{children}</Link.Trigger>
      {preview ? <Link.Preview style={{ height: previewSize, width: previewSize }} /> : null}
      <Link.Menu>
        {items.map((item) => (
          <Link.MenuAction
            destructive={item.destructive}
            disabled={item.disabled}
            isOn={item.checked}
            key={item.id}
            onPress={item.onPress}
          >
            {item.label}
          </Link.MenuAction>
        ))}
      </Link.Menu>
    </Link>
  );
}
