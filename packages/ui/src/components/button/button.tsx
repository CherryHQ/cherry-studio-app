import {
  cloneElement,
  createContext,
  forwardRef,
  type ReactElement,
  type ReactNode,
  useContext,
} from 'react';
import { Pressable, Text, type PressableProps, type TextProps, type View } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import { cn } from '../../utils';
import { Spinner, type SpinnerSize } from '../loading/spinner';

export type ButtonVariant = 'default' | 'destructive' | 'ghost' | 'outline' | 'secondary';
export type ButtonSize = 'default' | 'lg' | 'sm' | 'xs';

export type ButtonProps = Omit<PressableProps, 'children'> & {
  children?: ReactNode;
  className?: string;
  icon?: ReactElement<{ className?: string }>;
  loading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export type ButtonLabelProps = TextProps & {
  className?: string;
};

const rootBaseStyles =
  'flex-row items-center justify-center overflow-hidden rounded-xl active:opacity-80 disabled:opacity-40';

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
    root: 'bg-transparent shadow-none',
  },
  outline: {
    label: 'text-foreground',
    root: 'border border-border bg-transparent shadow-none',
  },
  secondary: {
    label: 'text-secondary-foreground',
    root: 'border border-border bg-field shadow-none',
  },
};

const ButtonVariantContext = createContext<ButtonVariant>('default');
const ButtonSizeContext = createContext<ButtonSize>('default');

const ButtonLabel = forwardRef<Text, ButtonLabelProps>(function ButtonLabel(
  { className, ...props },
  ref,
) {
  const variant = useContext(ButtonVariantContext);
  const size = useContext(ButtonSizeContext);

  return (
    <Text
      {...props}
      className={cn(
        'min-w-0 shrink text-center font-medium',
        sizeStyles[size].label,
        variantStyles[variant].label,
        className,
      )}
      ref={ref}
    />
  );
});

ButtonLabel.displayName = 'Button.Label';

const ButtonRoot = forwardRef<View, ButtonProps>(function Button(
  {
    accessibilityRole = 'button',
    accessibilityState,
    children,
    className,
    disabled = false,
    hitSlop,
    icon,
    loading = false,
    size = 'default',
    variant = 'default',
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const isIconOnly = icon !== undefined && children == null;
  const labelStyle = useResolveClassNames(variantStyles[variant].label);
  const spinnerColor = typeof labelStyle.color === 'string' ? labelStyle.color : undefined;
  const iconElement = icon
    ? cloneElement(icon, {
        className: cn(sizeStyles[size].icon, variantStyles[variant].label, icon.props.className),
      })
    : null;
  const mergedAccessibilityState = {
    ...accessibilityState,
    ...(isDisabled ? { disabled: true } : {}),
    ...(loading ? { busy: true } : {}),
  };

  return (
    <ButtonVariantContext.Provider value={variant}>
      <ButtonSizeContext.Provider value={size}>
        <Pressable
          {...props}
          accessibilityRole={accessibilityRole}
          accessibilityState={mergedAccessibilityState}
          className={cn(
            rootBaseStyles,
            variantStyles[variant].root,
            sizeStyles[size].root,
            isIconOnly ? sizeStyles[size].iconOnly : undefined,
            className,
          )}
          disabled={isDisabled}
          hitSlop={hitSlop ?? (size === 'xs' ? 8 : undefined)}
          ref={ref}
        >
          {loading ? (
            <Spinner
              accessibilityElementsHidden
              color={spinnerColor}
              importantForAccessibility="no"
              size={sizeStyles[size].spinner}
            />
          ) : null}
          {!loading ? iconElement : null}
          {typeof children === 'string' || typeof children === 'number' ? (
            <ButtonLabel>{children}</ButtonLabel>
          ) : (
            children
          )}
        </Pressable>
      </ButtonSizeContext.Provider>
    </ButtonVariantContext.Provider>
  );
});

ButtonRoot.displayName = 'Button';

export const Button = Object.assign(ButtonRoot, {
  Label: ButtonLabel,
});
