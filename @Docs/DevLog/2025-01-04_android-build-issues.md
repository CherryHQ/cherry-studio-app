# Android 构建问题解决日志

## 日期：2025-01-04

## 问题描述

在使用 `eas build --platform android --local` 构建 Android APK 时遇到了一系列依赖解析问题。

## 错误信息

主要错误类型：
1. `@expo/metro-config tried to access @babel/traverse, but it isn't declared in its dependencies`
2. `@expo/metro-config tried to access metro-minify-terser, but it isn't declared in its dependencies`
3. `babel-preset-expo tried to access debug, but it isn't declared in its dependencies`

## 根本原因

EAS 构建过程中使用了 Yarn PnP (Plug'n'Play)，这对依赖声明要求非常严格。许多 Expo 相关的包在其 package.json 中没有正确声明所有运行时依赖，导致在 PnP 环境中无法正常工作。

## 已尝试的解决方案

### 1. 添加缺失的依赖到 dependencies

已添加的包：
- `@babel/code-frame`
- `@babel/traverse`
- `metro-cache-key`
- `metro-minify-terser`
- `babel-preset-expo`
- `debug`

### 2. 使用 resolutions 强制版本

在 package.json 中添加了：
```json
"resolutions": {
  "esbuild": "^0.25.4",
  "@expo/metro-config": "0.20.17",
  "metro-minify-terser": "^0.82.4",
  "@babel/generator": "^7.27.3",
  "@babel/parser": "^7.27.4",
  "@babel/types": "^7.27.3"
}
```

### 3. 配置使用 node-modules

项目已配置为使用传统的 node_modules 而不是 PnP：
```yaml
# .yarnrc.yml
nodeLinker: node-modules
```

## 当前状态

仍然遇到依赖问题，需要继续添加缺失的依赖。这种方法虽然可行，但效率较低。

## 建议的解决方案

### 方案1：继续添加缺失依赖（当前方案）
- 优点：直接解决问题
- 缺点：需要逐个发现和添加，可能有很多缺失的依赖

### 方案2：使用云构建
- 使用 `eas build --platform android` 而不是 `--local`
- 优点：避免本地环境问题
- 缺点：需要网络连接，构建时间可能更长

### 方案3：降级到兼容版本
- 尝试使用较旧但更稳定的 Expo SDK 版本
- 优点：可能避免依赖问题
- 缺点：失去新功能

## 下一步行动

1. 继续添加遇到的缺失依赖
2. 如果问题持续，考虑使用云构建
3. 记录所有需要添加的依赖，为将来的项目做参考

## 相关链接

- [Expo EAS Build 文档](https://docs.expo.dev/build/introduction/)
- [Yarn PnP 文档](https://yarnpkg.com/features/pnp)
- [Metro 配置文档](https://metrobundler.dev/docs/configuration)
