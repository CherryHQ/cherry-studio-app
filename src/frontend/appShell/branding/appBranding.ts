import { isEnterpriseProfile } from '@/shared/data/activeProfile';

const COMMUNITY_LOGO = require('@/assets/cherry-studio-logo.png');
const ENTERPRISE_LOGO = require('@/assets/enterprise-logo.png');

/** Profile selection is fixed before React loads; switching spaces reloads this runtime. */
export function getAppLogo() {
  return isEnterpriseProfile() ? ENTERPRISE_LOGO : COMMUNITY_LOGO;
}
