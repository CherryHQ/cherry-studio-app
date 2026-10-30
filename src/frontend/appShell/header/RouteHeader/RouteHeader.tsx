import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { HeaderToolbarAction } from '../components/HeaderAction';
import { HeaderChrome } from '../components/HeaderChrome';
import type { RouteHeaderProps } from './RouteHeader.types';
import { useRouteHeaderLeadingAction } from './useRouteHeaderLeadingAction';

/** Shared page header whose leading behavior is owned by the active route stack. */
export function RouteHeader({
  leftActions,
  onBack,
  rightActions,
  selection,
  title = '',
  titleElement,
}: RouteHeaderProps) {
  const { t } = useTranslation();
  const leadingAction = useRouteHeaderLeadingAction(onBack);
  const defaultLeftActions = useMemo<HeaderToolbarAction[]>(
    () => (leadingAction ? [leadingAction] : []),
    [leadingAction],
  );
  const selectionActions: HeaderToolbarAction[] | undefined = selection
    ? [
        {
          accessibilityLabel: t('common.cancel'),
          icon: ArrowLeftIcon,
          key: 'exit-selection',
          nativeIcon: 'chevron.left',
          onPress: selection.onExit,
          type: 'icon',
        },
      ]
    : undefined;

  return (
    <HeaderChrome
      leftActions={
        selectionActions ??
        (leftActions && leftActions.length > 0 ? leftActions : defaultLeftActions)
      }
      rightActions={selection ? undefined : rightActions}
      title={selection ? t('common.selection.count', { count: selection.selectedCount }) : title}
      titleAlign="center"
      titleElement={selection ? undefined : titleElement}
    />
  );
}

export type { RouteHeaderProps, RouteHeaderRootAction } from './RouteHeader.types';
