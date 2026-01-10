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
- **包管理器**: Pnpm
- **UI**: Tamagui
- **路由**: React Navigation
- **状态管理**: Redux Toolkit

## 🚀 开发

> 相关开发文档在 docs 文件夹中

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
    pnpm install
   ```

4. **生成数据库**

```bash
npx drizzle-kit generate
```
5. **构建 MCP Streamable Http**
```bash
cd packages/react-native-streamable-http
npm install
npm run build
```
6. **启动应用程序**

iOS:

```bash
npx expo prebuild -p ios

cd ios # 添加自签证书

npx expo run:ios -d
```

Android:

```bash
npx expo prebuild -p android

cd android # 在 local.properties 中添加 Android SDK 路径

npx expo run:android -d
```

### Android SDK 设置

#### Windows 用户:

```
sdk.dir=C:\\Users\\UserName\\AppData\\Local\\Android\\sdk
```

或 (适用于较新版本的 Android Studio / IntelliJ IDEA):

```
sdk.dir=C\:\\Users\\USERNAME\\AppData\\Local\\Android\\sdk
```

其中 USERNAME 是您的电脑用户名。同时，请确保文件夹名为 sdk 或 Sdk。

示例:

```
sdk.dir=C:\\Users\\USERNAME\\AppData\\Local\\Android\\sdk
```

或:

```
sdk.dir=C\:\\Users\\USERNAME\\AppData\\Local\\Android\\Sdk
```

#### Mac 用户:

```
sdk.dir = /Users/USERNAME/Library/Android/sdk
```

其中 USERNAME 是您的 OSX 用户名。

您也可以在路径中使用环境变量，例如:

```bash
export ANDROID_HOME=/Users/$(whoami)/Library/Android/sdk
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools"
```

#### Linux (Ubuntu) 用户:

```
sdk.dir = /home/USERNAME/Android/Sdk
```

其中 USERNAME 是您的 Linux 用户名。

> 请使用实体设备或模拟器进行开发，请勿使用 Expo Go
