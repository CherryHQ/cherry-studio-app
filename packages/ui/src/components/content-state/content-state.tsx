import type { ReactNode } from 'react';
import { Text, View, type ViewProps } from 'react-native';

import { cn } from '../../utils';
import { Button, type ButtonProps } from '../button';
import { Spinner } from '../loading/spinner';

export type ContentStateAction = Omit<ButtonProps, 'children' | 'shape' | 'size' | 'variant'> & {
  children: ReactNode;
};

export type ContentStateLayout = 'centered' | 'leading' | 'row';
export type ContentStateProminence = 'default' | 'prominent';

type ContentStateBaseProps = Omit<ViewProps, 'children' | 'className' | 'style'> & {
  description?: string;
  icon?: ReactNode;
  layout?: ContentStateLayout;
  primaryAction?: ContentStateAction;
  prominence?: ContentStateProminence;
  secondaryAction?: ContentStateAction;
  title?: string;
};

export type ContentStateEmptyProps = ContentStateBaseProps;
export type ContentStateErrorProps = ContentStateBaseProps;
export type ContentStateLoadingProps = ContentStateBaseProps;
export type ContentStateIconProps = ViewProps;

type ContentStateKind = 'empty' | 'error' | 'loading';

type ContentStateFrameProps = ContentStateBaseProps & {
  kind: ContentStateKind;
};

const layoutStyles: Record<ContentStateLayout, string> = {
  centered: 'items-center justify-center gap-4',
  leading: 'items-start justify-center gap-4',
  row: 'flex-row items-center justify-start gap-2',
};

function ContentStateFrame({
  accessibilityState,
  description,
  icon,
  kind,
  layout = 'centered',
  primaryAction,
  prominence = 'default',
  secondaryAction,
  title,
  ...props
}: ContentStateFrameProps) {
  const isCentered = layout === 'centered';
  const isRow = layout === 'row';
  const isProminent = prominence === 'prominent';
  const resolvedIcon =
    icon ??
    (kind === 'loading' ? (
      <Spinner
        accessibilityLabel={title}
        accessibilityRole="progressbar"
        size={isRow ? 'sm' : 'default'}
      />
    ) : null);

  return (
    <View
      {...props}
      accessibilityState={{
        ...accessibilityState,
        ...(kind === 'loading' ? { busy: true } : {}),
      }}
      className={layoutStyles[layout]}
    >
      {resolvedIcon ? (
        <View className="shrink-0 items-center justify-center">{resolvedIcon}</View>
      ) : null}
      {title || description ? (
        <View className={cn('max-w-full gap-1.5', isCentered ? 'items-center' : 'items-start')}>
          {title ? (
            <Text
              className={cn(
                isCentered ? 'text-center' : 'text-left',
                'font-semibold',
                isProminent ? 'text-lg' : 'text-base',
                kind === 'error' ? 'text-error' : 'text-foreground',
              )}
              selectable={kind === 'error'}
            >
              {title}
            </Text>
          ) : null}
          {description ? (
            <Text
              className={cn(
                isCentered ? 'text-center' : 'text-left',
                'text-muted-foreground text-sm',
              )}
              selectable
            >
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
      {primaryAction || secondaryAction ? (
        <View
          className={cn(
            'flex-row flex-wrap items-center gap-3',
            isCentered ? 'justify-center' : 'justify-start',
          )}
        >
          {primaryAction ? (
            <Button
              {...primaryAction}
              shape={isProminent ? 'pill' : 'rounded'}
              size={isProminent ? 'default' : 'sm'}
              variant="default"
            />
          ) : null}
          {secondaryAction ? (
            <Button
              {...secondaryAction}
              shape={isProminent ? 'pill' : 'rounded'}
              size={isProminent ? 'default' : 'sm'}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The disc a page state's glyph sits in. It takes arbitrary children because
 * what goes inside is not always an icon — a provider's own mark belongs there
 * whenever the state is empty of that provider's things.
 */
function ContentStateIcon({ className, ...props }: ContentStateIconProps) {
  return (
    <View
      {...props}
      className={cn('size-14 items-center justify-center rounded-full bg-secondary', className)}
    />
  );
}

ContentStateIcon.displayName = 'ContentState.Icon';

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
  Icon: ContentStateIcon,
  Loading: ContentStateLoading,
};
