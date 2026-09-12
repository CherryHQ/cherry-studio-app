import { Description as HeroDescription } from 'heroui-native/description';
import { FieldError as HeroFieldError } from 'heroui-native/field-error';
import { Label as HeroLabel } from 'heroui-native/label';
import { TextField as HeroTextField } from 'heroui-native/text-field';
import type { ReactNode } from 'react';

export type TextFieldProps = {
  children?: ReactNode;
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  testID?: string;
};

export type TextFieldLabelProps = {
  children?: ReactNode;
  testID?: string;
};

export type TextFieldDescriptionProps = TextFieldLabelProps;
export type TextFieldErrorProps = TextFieldLabelProps;

function TextFieldRoot({ children, disabled, invalid, required, testID }: TextFieldProps) {
  return (
    <HeroTextField isDisabled={disabled} isInvalid={invalid} isRequired={required} testID={testID}>
      {children}
    </HeroTextField>
  );
}

TextFieldRoot.displayName = 'TextField';

function TextFieldLabel({ children, testID }: TextFieldLabelProps) {
  return (
    <HeroLabel className="text-foreground" testID={testID}>
      {children}
    </HeroLabel>
  );
}

TextFieldLabel.displayName = 'TextField.Label';

function TextFieldDescription({ children, testID }: TextFieldDescriptionProps) {
  return (
    <HeroDescription hideOnInvalid testID={testID}>
      {children}
    </HeroDescription>
  );
}

TextFieldDescription.displayName = 'TextField.Description';

function TextFieldError({ children, testID }: TextFieldErrorProps) {
  return <HeroFieldError testID={testID}>{children}</HeroFieldError>;
}

TextFieldError.displayName = 'TextField.Error';

export const TextField = Object.assign(TextFieldRoot, {
  Description: TextFieldDescription,
  Error: TextFieldError,
  Label: TextFieldLabel,
});
