import type { TextStyle } from 'react-native';

// Tailwind's `text-base` carries a 24pt line height, which is 6pt taller than
// what this font actually needs — and UIKit puts every bit of that extra leading
// *below* the baseline instead of splitting it. The glyphs therefore sit low
// inside the box they were laid out in, while the caret, which tracks the line
// box rather than the glyphs, stays centered. Measured on an iPhone 17
// simulator, the glyph offset is exactly `(lineHeight - 18) / 2`, which puts the
// font's natural line box at 18pt for a 16pt size.
//
// So padding cannot fix this: shifting the field moves the caret and the glyphs
// together, and centering one puts the other 3pt out. Only the line height
// closes the gap between them.
//
// 20 is the compromise. It cuts the glyph offset to 1pt — invisible at this size
// — while leaving enough leading for CJK to breathe once the field wraps. 18
// centers the glyphs exactly but crowds wrapped lines together, and descenders
// come close enough to the next line to read as a bug.
//
// `textAlignVertical` is NOT an alternative: it is Android-only and moves
// nothing here (verified by measurement, not by reading the docs).
//
// To re-measure: focus the field, take a native-resolution screenshot
// (`xcrun simctl io <udid> screenshot`), and compare the midpoints of the caret
// and of the glyph band against the midpoint of the pill.
export const composerTextStyle: TextStyle = { lineHeight: 20 };
