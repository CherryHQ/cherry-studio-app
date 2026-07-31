// Default re-export so non-iOS platforms (and type resolution) resolve the
// Android implementation; iOS picks up CameraShutterButton.ios.tsx via Metro.
export { CameraShutterButton } from './CameraShutterButton.android';
