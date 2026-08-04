import { Spinner } from 'heroui-native';
import {
  cloneElement,
  createContext,
  forwardRef,
  type ReactElement,
  type ReactNode,
  useContext,
} from 'react';
import { Pressable, Text, type PressableProps, type TextProps, type View } from 'react-native';
import { twMerge } from 'tailwind-merge';
import { useResolveClassNames } from 'uniwind';

export type ButtonVariant = 'default' | 'destructive' | 'ghost' | 'outline' | 'secondary';

export type ButtonProps = Omit<PressableProps, 'children'> & {
  children?: ReactNode;
  className?: string;
  icon?: ReactElement<{ className?: string }>;
  loading?: boolean;
  variant?: ButtonVariant;
};

export type ButtonLabelProps = TextProps & {
  className?: string;
};

const rootBaseStyles =
  'flex-row items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-2.5 active:opacity-80 disabled:opacity-40';

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
    root: 'bg-secondary shadow-none',
  },
};

const ButtonVariantContext = createContext<ButtonVariant>('default');

const ButtonLabel = forwardRef<Text, ButtonLabelProps>(function ButtonLabel(
  { className, ...props },
  ref,
) {
  const variant = useContext(ButtonVariantContext);

  return (
    <Text
      {...props}
      className={twMerge(
        'min-w-0 shrink text-center text-base font-medium',
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
    icon,
    loading = false,
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
        className: twMerge('size-5', variantStyles[variant].label, icon.props.className),
      })
    : null;
  const mergedAccessibilityState = {
    ...accessibilityState,
    ...(isDisabled ? { disabled: true } : {}),
    ...(loading ? { busy: true } : {}),
  };

  return (
    <ButtonVariantContext.Provider value={variant}>
      <Pressable
        {...props}
        accessibilityRole={accessibilityRole}
        accessibilityState={mergedAccessibilityState}
        className={twMerge(
          rootBaseStyles,
          variantStyles[variant].root,
          isIconOnly ? 'p-2.5' : undefined,
          className,
        )}
        disabled={isDisabled}
        ref={ref}
      >
        {loading ? (
          <Spinner
            accessibilityElementsHidden
            color={spinnerColor}
            importantForAccessibility="no"
            size="sm"
          />
        ) : null}
        {!loading ? iconElement : null}
        {typeof children === 'string' || typeof children === 'number' ? (
          <ButtonLabel>{children}</ButtonLabel>
        ) : (
          children
        )}
      </Pressable>
    </ButtonVariantContext.Provider>
  );
});

ButtonRoot.displayName = 'Button';

export const Button = Object.assign(ButtonRoot, {
  Label: ButtonLabel,
});
