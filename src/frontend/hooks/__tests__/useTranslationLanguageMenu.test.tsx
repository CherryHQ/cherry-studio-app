import type { MenuItem } from '@cherrystudio/ui/components';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AppLanguage } from '@/shared/utils/languages';

import { useTranslationLanguageMenu } from '../useTranslationLanguageMenu';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { resolvedLanguage: 'zh-CN' } }),
}));

let items: readonly MenuItem[];
let renderer: ReactTestRenderer;
const onSelect = jest.fn();

function Harness({ language }: { language?: AppLanguage }) {
  const choices = useTranslationLanguageMenu({ onSelect, selectedLanguage: language });
  useEffect(() => {
    items = choices;
  }, [choices]);
  return null;
}

beforeEach(() => onSelect.mockReset());
afterEach(() => act(() => renderer?.unmount()));

test('opening language choices does not select a target; choosing the checked language still dispatches', () => {
  act(() => {
    renderer = create(<Harness />);
  });
  expect(onSelect).not.toHaveBeenCalled();
  const checked = items.find((item) => item.checked)!;
  expect(checked.id).toBe('translation-language-zh-CN');
  act(() => checked.onPress());
  expect(onSelect).toHaveBeenCalledWith('zh-CN');
});

test('preserves an explicit target independently of the app language and dispatches another choice', () => {
  act(() => {
    renderer = create(<Harness language="fr-FR" />);
  });
  expect(items.find((item) => item.checked)?.label).toBe('Français');
  act(() => items.find((item) => item.id === 'translation-language-ja-JP')!.onPress());
  expect(onSelect).toHaveBeenCalledWith('ja-JP');
});
