# 🍒 Welcome to Cherry Studio App

English | [中文](./README-zh.md)

🍒 Cherry Studio App —— The official mobile version of Cherry Studio, bringing powerful LLMs (Large Language Models) interaction to your iOS and Android devices.

🌟 **Support the Project:** [Sponsor](https://github.com/CherryHQ/cherry-studio/blob/main/docs/sponsor.md) | Give the repo a Star!

## ✨ Key Features

- **Multi-LLM Provider Support**: (Gradually integrating) OpenAI, Gemini, Anthropic, and more.
- **AI Assistants & Conversations**: Access preset assistants and engage in smooth multi-model conversations.
- **Mobile Optimized**: Designed specifically for iOS/Android with light/dark theme support.
- **Core Tools**: Conversation management, history search, data migration.

## 🛠️ Tech Stack

- **Framework**: Expo React Native
- **Package Manager**: Pnpm
- **UI**: Tamagui
- **Routing**: React Navigation
- **State Management**: Redux Toolkit

## 🚀 Development

> Related development documentation is in the docs folder

1. **Clone the repository**

   ```bash
    git clone https://github.com/CherryHQ/cherry-studio-app.git
   ```

2. **Enter the directory**

   ```bash
    cd cherry-studio-app
   ```

3. **Install dependencies**

   ```bash
    pnpm install
   ```

4. **Generate database**

```bash
npx drizzle-kit generate
```
5. **Build the MCP Streamable Http**
```bash
cd packages/react-native-streamable-http
npm install
npm run build
```
6. **Start the application**

iOS:

```bash
npx expo prebuild -p ios

cd ios # Add self-signed certificate

npx expo run:ios -d
```

Android:

```bash
npx expo prebuild -p android

cd android # Add Android SDK path to local.properties

npx expo run:android -d
```

### Android SDK Setup

#### For windows users:

```
sdk.dir=C:\\Users\\UserName\\AppData\\Local\\Android\\sdk
```

or (for newer versions of Android Studio / IntelliJ IDEA):

```
sdk.dir=C\:\\Users\\USERNAME\\AppData\\Local\\Android\\sdk
```

Where USERNAME your PC user name. Also, make sure the folder is sdk or Sdk.

Example:

```
sdk.dir=C:\\Users\\USERNAME\\AppData\\Local\\Android\\sdk
```

or:

```
sdk.dir=C\:\\Users\\USERNAME\\AppData\\Local\\Android\\Sdk
```

#### For Mac users:

```
sdk.dir = /Users/USERNAME/Library/Android/sdk
```

Where USERNAME is your OSX username.

You can also use environment variables in your path, for example:

```bash
export ANDROID_HOME=/Users/$(whoami)/Library/Android/sdk
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools"
```

#### For Linux (Ubuntu) users:

```
sdk.dir = /home/USERNAME/Android/Sdk
```

Where USERNAME is your Linux username.

> Please use physical devices or simulators for development, do not use Expo Go
