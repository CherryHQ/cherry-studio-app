import { codegenNativeComponent, type CodegenTypes, type ViewProps } from 'react-native';

type EscapeEvent = Readonly<{ key: string }>;

export interface NativeProps extends ViewProps {
  onEscape?: CodegenTypes.DirectEventHandler<EscapeEvent>;
}

// Codegen requires the NativeComponent filename suffix. This view only listens;
// the focus-preserving overlay continues to own presentation.
export default codegenNativeComponent<NativeProps>('CherryMenuEscapeView', {
  excludedPlatforms: ['iOS'],
});
