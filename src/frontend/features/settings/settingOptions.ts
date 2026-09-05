import type { LanguageVarious } from '@/shared/data/preference';

import type { SettingOption } from './settingOption';

export const languageOptions: SettingOption<LanguageVarious>[] = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
];
