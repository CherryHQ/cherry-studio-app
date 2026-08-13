import { renderBackgroundActivity } from '@cherrystudio/ui/background-activity/ios';
import { createLiveActivity } from 'expo-widgets';

import type { PaintingActivityProps } from '@/shared/backgroundActivities/painting';

export default createLiveActivity<PaintingActivityProps>(
  'PaintingActivity',
  renderBackgroundActivity,
);
