import type { SettingOption } from '@/frontend/components/settings';
import type { LanguageVarious } from '@/shared/data/preference';

export const languageOptions: SettingOption<LanguageVarious>[] = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
];
