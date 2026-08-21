import type { LanguageVarious } from '@/shared/data/preference';

export type SettingOption<TValue extends string> = {
  label: string;
  value: TValue;
};

export const languageOptions: SettingOption<LanguageVarious>[] = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
];
