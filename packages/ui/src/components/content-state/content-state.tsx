import type { ReactNode } from 'react';
import { Text, View, type ViewProps } from 'react-native';

import { cn } from '../../utils';
import { Button, type ButtonProps } from '../button';
import { Spinner } from '../loading/spinner';

export type ContentStateAction = Omit<ButtonProps, 'children' | 'variant'> & {
  children: ReactNode;
};

/**
 * `inline` states annotate a list or a card that is already on screen, so they
 * add no room of their own. `page` states are the screen — they carry the
 * padding that centers them under a header, and their action reads as the
 * screen's one thing to do rather than as a control inside something else.
 */
export type ContentStateLayout = 'inline' | 'page';

type ContentStateBaseProps = Omit<ViewProps, 'children'> & {
  description?: string;
  icon?: ReactNode;
  layout?: ContentStateLayout;
  primaryAction?: ContentStateAction;
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

function ContentStateFrame({
  accessibilityState,
  className,
  description,
  icon,
  kind,
  layout = 'inline',
  primaryAction,
  secondaryAction,
  title,
  ...props
}: ContentStateFrameProps) {
  const isPage = layout === 'page';
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
      className={cn('items-center justify-center gap-4', isPage && 'px-8 py-16', className)}
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
            <Button
              {...primaryAction}
              className={cn(isPage && 'rounded-full', primaryAction.className)}
              size={primaryAction.size ?? (isPage ? 'default' : 'sm')}
              variant="default"
            />
          ) : null}
          {secondaryAction ? (
            <Button
              {...secondaryAction}
              className={cn(isPage && 'rounded-full', secondaryAction.className)}
              size={secondaryAction.size ?? (isPage ? 'default' : 'sm')}
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
