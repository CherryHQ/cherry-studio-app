# 🍒 欢迎来到 Cherry Studio App

[English](./README.md) | 中文

🍒 Cherry Studio App —— Cherry Studio 的官方移动版本，将强大的 LLMs(AI 大语言模型) 交互带到您的 iOS 和 Android 设备。

🌟 **支持项目:** [赞助](https://github.com/CherryHQ/cherry-studio/blob/main/docs/sponsor.md) | 给仓库点个 Star!

## ✨ 主要特性

- **多 LLM 提供商支持**: (逐步集成) OpenAI, Gemini, Anthropic 等。
- **AI 助手 & 对话**: 访问预设助手，进行流畅的多模型对话。
- **移动优化**: 专为 iOS/Android 设计，支持浅色/深色主题。
- **核心工具**: 会话管理，历史搜索，数据迁移。

## 🛠️ 技术栈

- **框架**: Expo React Native
- **包管理器**: Yarn
- **UI**: Tamagui
- **路由**: React Navigation
- **状态管理**: Redux Toolkit

## 🚀 开发

> 相关开发文档在docs中

1. **克隆仓库**

   ```bash
    git clone https://github.com/CherryHQ/cherry-studio-app.git
   ```

2. **进入目录**

   ```bash
    cd cherry-studio-app
   ```

3. **安装依赖**

   ```bash
     yarn install
   ```

4. **生成数据库**

```bash
npx drizzle-kit generate
```

5. **启动应用**

ios:

```bash
npx expo prebuild -p ios

cd ios 添加自签证书

npx expo run:ios -d
```

android:

```bash
npx expo prebuild -p android

cd android # 配置 Android SDK 路径到 local.properties

npx expo run:android -d
```
### Android SDK 配置

#### Windows 用户：

在 `local.properties` 添加：

```
sdk.dir=C:\\Users\\您的用户名\\AppData\\Local\\Android\\sdk
```
或者（新版本 Android Studio 适用）：

```
sdk.dir=C\:\\Users\\您的用户名\\AppData\\Local\\Android\\sdk
```
注意将 `您的用户名` 替换为你的实际电脑用户名，且确保文件夹名称为 sdk 或 Sdk。

#### Mac 用户：

```
sdk.dir = /Users/用户名/Library/Android/sdk
```
请将 `用户名` 替换为你的 macOS 用户名。

你也可以通过环境变量设置：

```bash
export ANDROID_HOME=/Users/$(whoami)/Library/Android/sdk
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools"
```

#### Linux (Ubuntu) 用户：

```
sdk.dir = /home/用户名/Android/Sdk
```
将 `用户名` 替换为你的 Linux 用户名。

> 请使用真机或者模拟器开发，不要使用Expo Go
