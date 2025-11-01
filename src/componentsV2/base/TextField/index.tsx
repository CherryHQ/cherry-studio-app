import type {
  TextFieldDescriptionProps,
  TextFieldErrorMessageProps,
  TextFieldInputEndContentProps,
  TextFieldInputProps,
  TextFieldInputStartContentProps,
  TextFieldLabelProps,
  TextFieldRootProps
} from 'heroui-native'
import { cn, TextField as HeroUITextField, useTextFieldContext } from 'heroui-native'
import React, { forwardRef } from 'react'
import type { TextInput, View } from 'react-native'

const TextFieldRoot = forwardRef<View, TextFieldRootProps>(({ className, ...props }, ref) => {
  return <HeroUITextField ref={ref} className={cn(className)} {...props} />
})

TextFieldRoot.displayName = 'TextField'

const TextFieldInput = forwardRef<TextInput, TextFieldInputProps>(({ className, classNames, ...props }, ref) => {
  const mergedClassNames = {
    ...(classNames ? { ...classNames } : {}),
    input: cn('text-[14px] py-0', classNames?.input)
  }

  return <HeroUITextField.Input ref={ref} className={cn('h-8', className)} classNames={mergedClassNames} {...props} />
})

TextFieldInput.displayName = 'TextFieldInput'

const TextField = Object.assign(TextFieldRoot, {
  Label: HeroUITextField.Label,
  Input: TextFieldInput,
  InputStartContent: HeroUITextField.InputStartContent,
  InputEndContent: HeroUITextField.InputEndContent,
  Description: HeroUITextField.Description,
  ErrorMessage: HeroUITextField.ErrorMessage
})

export type {
  TextFieldDescriptionProps,
  TextFieldErrorMessageProps,
  TextFieldInputEndContentProps,
  TextFieldInputProps,
  TextFieldInputStartContentProps,
  TextFieldLabelProps,
  TextFieldRootProps
}

export { useTextFieldContext }

export default TextField
