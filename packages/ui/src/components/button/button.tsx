import {
  cloneElement,
  createContext,
  forwardRef,
  type ReactElement,
  type ReactNode,
  useContext,
} from 'react';
import {
  Platform,
  Pressable,
  Text,
  View,
  type PressableProps,
  type TextProps,
  type TextInstance,
  type ViewInstance,
} from 'react-native';
import {
  Pressable as GesturePressable,
  type PressableEvent as GesturePressableEvent,
  type PressableProps as GesturePressableProps,
} from 'react-native-gesture-handler';
import { useResolveClassNames } from 'uniwind';

import { cn } from '../../utils';
import { Spinner, type SpinnerSize } from '../loading/spinner';
import { MenuInteraction } from '../menu/menu-interaction';

export type ButtonVariant =
  | 'default'
  | 'destructive'
  | 'ghost'
  | 'link'
  | 'outline'
  | 'secondary'
  | 'text'
  | 'tonal';
export type ButtonShape = 'pill' | 'rounded';
export type ButtonSize = 'default' | 'field' | 'footer' | 'inline' | 'lg' | 'sm' | 'xs';

export type ButtonProps = Omit<PressableProps, 'children' | 'className' | 'style'> & {
  children?: ReactNode;
  icon?: ReactElement<{ className?: string }>;
  loading?: boolean;
  shape?: ButtonShape;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export type ButtonLabelProps = Omit<TextProps, 'className' | 'style'>;

// Clearing borderWidth passes NaN into Android's rounded overflow clipping and hides children.
// Keep an explicit zero when switching away from a bordered variant (react-native#54217).
const rootBaseStyles =
  'flex-row items-center justify-center overflow-hidden border-0 active:opacity-80 disabled:opacity-40';
const nativeRootBaseStyles = 'flex-row items-center justify-center overflow-hidden border-0';

const nativePressedStyles: Partial<Record<ButtonVariant, string>> = {
  ghost: 'bg-secondary',
  link: 'opacity-70',
  text: 'opacity-70',
};

const shapeStyles: Record<ButtonShape, string> = {
  pill: 'rounded-full',
  rounded: 'rounded-xl',
};

const sizeStyles: Record<
  ButtonSize,
  { icon: string; iconOnly: string; label: string; root: string; spinner: SpinnerSize }
> = {
  default: {
    icon: 'size-5',
    iconOnly: 'p-2.5',
    label: 'text-base',
    root: 'gap-2 px-4 py-2.5',
    spinner: 'sm',
  },
  field: {
    icon: 'size-5',
    iconOnly: 'p-2.5',
    label: 'text-base',
    root: 'min-h-10 gap-2 px-4 py-2',
    spinner: 'sm',
  },
  footer: {
    icon: 'size-5',
    iconOnly: 'p-3',
    label: 'text-sm',
    root: 'min-h-12 min-w-12 gap-2 px-4 py-3',
    spinner: 'sm',
  },
  inline: {
    icon: 'size-4',
    iconOnly: 'p-1.5',
    label: 'text-sm',
    root: 'gap-1 px-0 py-1',
    spinner: 'sm',
  },
  lg: {
    icon: 'size-6',
    iconOnly: 'p-3',
    label: 'text-lg',
    root: 'gap-2.5 px-5 py-3',
    spinner: 'default',
  },
  sm: {
    icon: 'size-4',
    iconOnly: 'p-2',
    label: 'text-sm',
    root: 'gap-1.5 px-3 py-2',
    spinner: 'sm',
  },
  xs: {
    icon: 'size-4',
    iconOnly: 'p-1.5',
    label: 'text-sm',
    root: 'gap-1 px-2 py-1.5',
    spinner: 'sm',
  },
};

const variantStyles: Record<ButtonVariant, { label: string; root: string }> = {
  default: {
    label: 'text-background',
    root: 'bg-foreground shadow-xs',
  },
  destructive: {
    label: 'text-destructive-foreground',
    root: 'bg-destructive shadow-xs',
  },
  ghost: {
    label: 'text-foreground',
    root: 'bg-transparent shadow-none active:bg-secondary',
  },
  link: {
    label: 'text-link underline',
    root: 'bg-transparent shadow-none active:opacity-70',
  },
  outline: {
    label: 'text-foreground',
    root: 'border border-border bg-transparent shadow-none',
  },
  secondary: {
    label: 'text-secondary-foreground',
    root: 'border border-border bg-field shadow-none',
  },
  text: {
    label: 'text-link',
    root: 'bg-transparent shadow-none active:opacity-70',
  },
  // A quiet filled action that still holds its shape beside a default button.
  tonal: {
    label: 'text-foreground',
    root: 'bg-secondary shadow-none',
  },
};

const ButtonVariantContext = createContext<ButtonVariant>('default');
const ButtonSizeContext = createContext<ButtonSize>('default');

const ButtonLabel = forwardRef<TextInstance, ButtonLabelProps>(function ButtonLabel(props, ref) {
  const variant = useContext(ButtonVariantContext);
  const size = useContext(ButtonSizeContext);

  return (
    <Text
      {...props}
      className={cn(
        'min-w-0 shrink text-center font-medium',
        sizeStyles[size].label,
        variantStyles[variant].label,
      )}
      ref={ref}
    />
  );
});

ButtonLabel.displayName = 'Button.Label';

function toGestureHandler<Event>(
  handler: ((event: Event) => unknown) | null | undefined,
): ((event: GesturePressableEvent) => void) | undefined {
  return handler
    ? (event) => {
        handler(event as unknown as Event);
      }
    : undefined;
}

const ButtonRoot = forwardRef<ViewInstance, ButtonProps>(function Button(
  {
    accessibilityRole = 'button',
    accessibilityState,
    children,
    disabled = false,
    hitSlop,
    icon,
    loading = false,
    shape = 'rounded',
    size = 'default',
    variant = 'default',
    ...props
  },
  ref,
) {
  const shouldUseNativePresses = useContext(MenuInteraction)?.shouldUseNativePresses === true;
  const resolvedSize = size === 'footer' && Platform.OS !== 'android' ? 'lg' : size;
  const isDisabled = disabled || loading;
  const isIconOnly = icon !== undefined && children == null;
  const resolvedHitSlop = hitSlop ?? (size === 'xs' ? 8 : undefined);
  const labelStyle = useResolveClassNames(variantStyles[variant].label);
  const spinnerColor = typeof labelStyle.color === 'string' ? labelStyle.color : undefined;
  const iconElement = icon
    ? cloneElement(icon, {
        className: cn(
          sizeStyles[resolvedSize].icon,
          variantStyles[variant].label,
          icon.props.className,
        ),
      })
    : null;
  const mergedAccessibilityState = {
    ...accessibilityState,
    ...(isDisabled ? { disabled: true } : {}),
    // Android can retain the previous busy description when the key is omitted.
    busy: loading || accessibilityState?.busy || false,
  };
  const content = (
    <>
      {loading ? (
        <Spinner
          accessibilityElementsHidden
          color={spinnerColor}
          importantForAccessibility="no"
          size={sizeStyles[resolvedSize].spinner}
        />
      ) : null}
      {!loading ? iconElement : null}
      {typeof children === 'string' || typeof children === 'number' ? (
        <ButtonLabel>{children}</ButtonLabel>
      ) : (
        children
      )}
    </>
  );

  let control: ReactNode;
  if (shouldUseNativePresses) {
    const {
      blockNativeResponder: _blockNativeResponder,
      onHoverIn,
      onHoverOut,
      onLongPress,
      onPress,
      onPressIn,
      onPressMove: _onPressMove,
      onPressOut,
      ...gestureProps
    } = props;
    control = (
      <GesturePressable
        {...(gestureProps as Omit<GesturePressableProps, 'children' | 'style' | 'ref'>)}
        accessibilityRole={accessibilityRole}
        accessibilityState={mergedAccessibilityState}
        disabled={isDisabled}
        hitSlop={resolvedHitSlop as GesturePressableProps['hitSlop']}
        onHoverIn={toGestureHandler(onHoverIn)}
        onHoverOut={toGestureHandler(onHoverOut)}
        onLongPress={toGestureHandler(onLongPress)}
        onPress={toGestureHandler(onPress)}
        onPressIn={toGestureHandler(onPressIn)}
        onPressOut={toGestureHandler(onPressOut)}
        ref={ref as GesturePressableProps['ref']}
      >
        {({ pressed }) => (
          // Uniwind's interactive selectors belong to RN Pressable. Keep the
          // button's geometry and pressed/disabled styling on a native View here.
          <View
            className={cn(
              nativeRootBaseStyles,
              variantStyles[variant].root.replace(/\bactive:\S+/g, ''),
              shapeStyles[shape],
              sizeStyles[resolvedSize].root,
              isIconOnly ? sizeStyles[resolvedSize].iconOnly : undefined,
              pressed && (nativePressedStyles[variant] ?? 'opacity-80'),
              isDisabled && 'opacity-40',
            )}
          >
            {content}
          </View>
        )}
      </GesturePressable>
    );
  } else {
    control = (
      <Pressable
        {...props}
        accessibilityRole={accessibilityRole}
        accessibilityState={mergedAccessibilityState}
        className={cn(
          rootBaseStyles,
          variantStyles[variant].root,
          shapeStyles[shape],
          sizeStyles[resolvedSize].root,
          isIconOnly ? sizeStyles[resolvedSize].iconOnly : undefined,
        )}
        disabled={isDisabled}
        hitSlop={resolvedHitSlop}
        ref={ref}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <ButtonVariantContext.Provider value={variant}>
      <ButtonSizeContext.Provider value={resolvedSize}>{control}</ButtonSizeContext.Provider>
    </ButtonVariantContext.Provider>
  );
});

ButtonRoot.displayName = 'Button';

export const Button = Object.assign(ButtonRoot, {
  Label: ButtonLabel,
});
