import type { ReactNode } from 'react';
import { Text, View, type ViewProps } from 'react-native';

import { cn } from '../../utils';
import { Button, type ButtonProps } from '../button';
import { Spinner } from '../loading/spinner';

export type ContentStateAction = Omit<ButtonProps, 'children' | 'variant'> & {
  children: ReactNode;
};

type ContentStateBaseProps = Omit<ViewProps, 'children'> & {
  description?: string;
  icon?: ReactNode;
  primaryAction?: ContentStateAction;
  secondaryAction?: ContentStateAction;
  title?: string;
};

export type ContentStateEmptyProps = ContentStateBaseProps;
export type ContentStateErrorProps = ContentStateBaseProps;
export type ContentStateLoadingProps = ContentStateBaseProps;

type ContentStateKind = 'empty' | 'error' | 'loading';

type ContentStateFrameProps = ContentStateBaseProps & {
  kind: ContentStateKind;
};

function ContentStateFrame({
  accessibilityState,
  className,
  description,
  icon,
  kind,
  primaryAction,
  secondaryAction,
  title,
  ...props
}: ContentStateFrameProps) {
  const resolvedIcon =
    icon ??
    (kind === 'loading' ? (
      <Spinner accessibilityLabel={title} accessibilityRole="progressbar" />
    ) : null);

  return (
    <View
      {...props}
      accessibilityState={{
        ...accessibilityState,
        ...(kind === 'loading' ? { busy: true } : {}),
      }}
      className={cn('items-center justify-center gap-4', className)}
    >
      {resolvedIcon ? (
        <View className="shrink-0 items-center justify-center">{resolvedIcon}</View>
      ) : null}
      {title || description ? (
        <View className="max-w-full items-center gap-1.5">
          {title ? (
            <Text
              className={cn(
                'text-center font-semibold text-base',
                kind === 'error' ? 'text-destructive-foreground' : 'text-foreground',
              )}
              selectable={kind === 'error'}
            >
              {title}
            </Text>
          ) : null}
          {description ? (
            <Text className="text-center text-muted-foreground text-sm" selectable>
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
      {primaryAction || secondaryAction ? (
        <View className="flex-row flex-wrap items-center justify-center gap-3">
          {primaryAction ? (
            <Button {...primaryAction} size={primaryAction.size ?? 'sm'} variant="default" />
          ) : null}
          {secondaryAction ? (
            <Button {...secondaryAction} size={secondaryAction.size ?? 'sm'} variant="secondary" />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ContentStateEmpty(props: ContentStateEmptyProps) {
  return <ContentStateFrame {...props} kind="empty" />;
}

ContentStateEmpty.displayName = 'ContentState.Empty';

function ContentStateError(props: ContentStateErrorProps) {
  return <ContentStateFrame {...props} kind="error" />;
}

ContentStateError.displayName = 'ContentState.Error';

function ContentStateLoading(props: ContentStateLoadingProps) {
  return <ContentStateFrame {...props} kind="loading" />;
}

ContentStateLoading.displayName = 'ContentState.Loading';

export const ContentState = {
  Empty: ContentStateEmpty,
  Error: ContentStateError,
  Loading: ContentStateLoading,
};
