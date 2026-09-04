import type { LucideIcon, LucideProps } from 'lucide-react-native';
import { forwardRef } from 'react';
import { Path, Svg } from 'react-native-svg';

import { createIcon } from '../create-icon';

// Cherry Studio desktop's complete iconfont glyph U+E795. The first contour is
// the enclosing circle and the second contour cuts the upward arrow out of it.
const sendGlyphPath =
  'M512 -85a469 469 0 1 1 0 938a469 469 0 1 1 0-938z M501 588Q511 597 524 597Q537 597 547 588L697 438Q707 428 707 415Q707 402 697.5 392.5Q688 383 674.5 383Q661 383 652 392L556 488V171Q556 157 546.5 148Q537 139 524 139Q511 139 501.5 148Q492 157 492 171V488L396 393Q387 383 373.5 383Q360 383 350.5 392.5Q341 402 341 415Q341 428 351 438Z';

const DesktopSendGlyph = forwardRef<Svg, LucideProps>(function DesktopSendGlyph(
  {
    absoluteStrokeWidth: _absoluteStrokeWidth,
    children,
    color = 'currentColor',
    height = 24,
    size,
    strokeWidth: _strokeWidth,
    width = 24,
    ...props
  },
  ref,
) {
  return (
    <Svg
      ref={ref}
      fill="none"
      height={size ?? height}
      viewBox="0 0 1024 1024"
      width={size ?? width}
      {...props}
    >
      <Path
        d={sendGlyphPath}
        fill={color}
        fillRule="evenodd"
        transform="translate(0 896) scale(1 -1)"
      />
      {children}
    </Svg>
  );
});

export default createIcon(DesktopSendGlyph as unknown as LucideIcon, 'SendIcon');
