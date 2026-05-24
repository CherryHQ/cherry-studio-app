import { Stack, useRouter } from 'expo-router';
import { XIcon } from 'lucide-uniwind';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { HeaderIconButton } from '../components/HeaderIconButton';

export type CloseHeaderProps = {
  title?: string;
};

export function CloseHeader({ title = '' }: CloseHeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const close = useCallback(() => {
    router.back();
  }, [router]);

  const options = useMemo(
    () => ({
      headerBackVisible: false,
      headerLeft: () => (
        <HeaderIconButton accessibilityLabel={t('common.close')} onPress={close}>
          <XIcon className="size-6 text-foreground" strokeWidth={2} />
        </HeaderIconButton>
      ),
      title,
    }),
    [close, t, title],
  );

  return <Stack.Screen options={options} />;
}
