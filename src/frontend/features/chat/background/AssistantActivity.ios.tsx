import { renderBackgroundActivity } from '@cherrystudio/ui/background-activity/ios';
import { createLiveActivity } from 'expo-widgets';

import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivities/chatReply';

export default createLiveActivity<BackgroundReplyActivityProps>(
  'AssistantActivity',
  renderBackgroundActivity,
);
