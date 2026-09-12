import { useTextField as useHeroTextField } from 'heroui-native/text-field';

type TextFieldState = {
  disabled: boolean;
  invalid: boolean;
  required: boolean;
};

export function useTextFieldState(): TextFieldState | undefined {
  const state = useHeroTextField();

  return state
    ? {
        disabled: state.isDisabled,
        invalid: state.isInvalid,
        required: state.isRequired,
      }
    : undefined;
}
