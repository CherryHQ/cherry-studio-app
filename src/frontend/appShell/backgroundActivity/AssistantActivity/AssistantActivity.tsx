import type { LiveActivityFactory } from 'expo-widgets';

import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivity/chatReply';

/**
 * Live Activities are iOS-only; other platforms resolve this module instead
 * of the `.ios.tsx` layout and composition falls back to the no-op presenter.
 * (The layout module cannot be imported off iOS: `createLiveActivity` touches
 * the expo-widgets native module at import time.)
 */
const AssistantActivity: LiveActivityFactory<BackgroundReplyActivityProps> | undefined = undefined;

export default AssistantActivity;
