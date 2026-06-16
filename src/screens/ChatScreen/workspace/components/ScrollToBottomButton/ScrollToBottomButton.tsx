// 无平台后缀入口：供 TS 解析与非 iOS/Android 平台（web）回退到 Android 实现。
// Metro 在 iOS 选 .ios.tsx、Android 选 .android.tsx。
export { ScrollToBottomButton } from './ScrollToBottomButton.android';
