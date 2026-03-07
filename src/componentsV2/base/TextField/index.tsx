import type {
  DescriptionProps,
  FieldErrorRootProps,
  InputGroupPrefixProps,
  InputGroupSuffixProps,
  InputProps,
  LabelProps,
  TextFieldRootProps
} from 'heroui-native'
import { cn, Description, FieldError, Input as HeroUIInput, InputGroup, Label, useTextField } from 'heroui-native'
import React, { forwardRef } from 'react'
import type { TextInput, View } from 'react-native'

type AnimationRoot<TConfig extends Record<string, any> = Record<string, any>> =
  | boolean
  | 'disabled'
  | 'disable-all'
  | (TConfig & { state?: 'disabled' | 'disable-all' | boolean })

export interface TextFieldInputProps extends InputProps {
  animation?: AnimationRoot<{
    backgroundColor?: { value?: Record<string, string> }
    borderColor?: { value?: Record<string, string> }
  }>
}

const TextFieldRoot = forwardRef<View, TextFieldRootProps>(({ className, ...props }, ref) => {
  return <InputGroup ref={ref} className={cn('gap-1', className)} {...props} />
})

TextFieldRoot.displayName = 'TextField'

const TextFieldInput = forwardRef<TextInput, TextFieldInputProps>(({ className, ...props }, ref) => {
  return <HeroUIInput ref={ref} className={cn('h-8', className)} selectionColor="#2563eb" {...props} />
})

TextFieldInput.displayName = 'TextFieldInput'

const TextField = Object.assign(TextFieldRoot, {
  Label: Label,
  Input: TextFieldInput,
  InputStartContent: InputGroup.Prefix,
  InputEndContent: InputGroup.Suffix,
  Description: Description,
  ErrorMessage: FieldError
})

export type {
  DescriptionProps as TextFieldDescriptionProps,
  FieldErrorRootProps as TextFieldErrorMessageProps,
  InputGroupSuffixProps as TextFieldInputEndContentProps,
  InputGroupPrefixProps as TextFieldInputStartContentProps,
  LabelProps as TextFieldLabelProps,
  TextFieldRootProps
}

export { useTextField }

export default TextField
