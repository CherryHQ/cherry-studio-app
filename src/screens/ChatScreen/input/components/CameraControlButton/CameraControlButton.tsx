// Default re-export so non-iOS platforms (and type resolution) resolve the
// Android implementation; iOS picks up CameraControlButton.ios.tsx via Metro.
export { CameraControlButton } from './CameraControlButton.android';
