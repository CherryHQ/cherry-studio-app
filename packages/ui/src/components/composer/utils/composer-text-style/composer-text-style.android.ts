import type { TextStyle } from 'react-native';

// Android keeps Tailwind's line height. The iOS override exists to undo a
// measured UIKit behaviour — extra leading landing entirely below the baseline —
// and the same measurement has not been made here, so overriding Android too
// would be changing its layout on the strength of another platform's bug.
export const composerTextStyle: TextStyle = {};
