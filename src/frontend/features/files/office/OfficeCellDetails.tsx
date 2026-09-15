import ChevronRight from '@cherrystudio/app-icons/icons/chevron-right';
import { BottomSheet, Button, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import type { OfficeCellSelection } from './officePreview';

/** The compact formula row stays outside the document canvas on phones and iPad alike. */
export function OfficeCellDetails({ selection }: { selection: OfficeCellSelection | null }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const copy = (text: string) => {
    void Clipboard.setStringAsync(text).then(
      () => toast.show({ label: t('fileViewer.copied'), variant: 'success' }),
      () => toast.show({ label: t('fileViewer.copyFailed'), variant: 'danger' }),
    );
  };

  return (
    <>
      <View className="flex-row items-center gap-2 border-t border-border px-4">
        <Text className="shrink-0 text-sm font-medium text-foreground">
          {selection?.address ?? 'fx'}
        </Text>
        <Text className="min-w-0 flex-1 text-sm text-muted-foreground" numberOfLines={1}>
          {selection
            ? selection.formula !== null
              ? `=${selection.formula}`
              : selection.text
            : t('fileViewer.office.selectCell')}
        </Text>
        <Button
          icon={<ChevronRight />}
          size="lg"
          variant="ghost"
          disabled={!selection}
          accessibilityLabel={t('fileViewer.office.cellDetails')}
          onPress={() => setOpen(true)}
        />
      </View>
      {selection ? (
        <BottomSheet
          title={`${selection.address} · ${t('fileViewer.office.cellDetails')}`}
          open={open}
          onClose={() => setOpen(false)}
          size="medium"
        >
          <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-4 px-6 pb-6">
            {selection.formula !== null ? (
              <View className="gap-2">
                <Text className="text-sm text-muted-foreground">
                  {t('fileViewer.office.formula')}
                </Text>
                <Text
                  selectable
                  className="text-base text-foreground"
                >{`=${selection.formula}`}</Text>
                <Button variant="secondary" onPress={() => copy(`=${selection.formula}`)}>
                  <Button.Label>{t('fileViewer.office.copyFormula')}</Button.Label>
                </Button>
              </View>
            ) : null}
            <View className="gap-2">
              <Text className="text-sm text-muted-foreground">
                {t('fileViewer.office.cellValue')}
              </Text>
              <Text selectable className="text-base text-foreground">
                {selection.text || t('fileViewer.office.emptyCell')}
              </Text>
              <Button
                disabled={!selection.text}
                variant="secondary"
                onPress={() => copy(selection.text)}
              >
                <Button.Label>{t('fileViewer.office.copyValue')}</Button.Label>
              </Button>
            </View>
            {selection.formulaState ? (
              <Text className="text-sm text-muted-foreground">
                {t(`fileViewer.office.formulaState.${selection.formulaState}`)}
              </Text>
            ) : null}
            {selection.truncated ? (
              <Text className="text-sm text-muted-foreground">
                {t('fileViewer.office.cellTruncated')}
              </Text>
            ) : null}
          </ScrollView>
        </BottomSheet>
      ) : null}
    </>
  );
}
