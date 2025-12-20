# 如何应用构建

## 安装依赖

```bash
npm install -g expo-cli eas-cli
```

## 打包

| 目标                             | 命令                                                               |
| -------------------------------- | ------------------------------------------------------------------ |
| 安卓本地构建（debug）            | `cd android && ./gradlew assembleDebug`                            |
| 安卓本地构建（release）          | `cd android && ./gradlew assembleRelease`                          |
| iOS 本地构建（debug）            | `cd ios && xcodebuild -scheme CherryStudio -configuration Debug`   |
| iOS 本地构建（release）          | `cd ios && xcodebuild -scheme CherryStudio -configuration Release` |
| 使用 EAS 线上编译安卓（debug）   | `eas build --platform android --profile development --local`       |
| 使用 EAS 线上编译安卓（release） | `eas build --platform android --local`                             |
| 使用 EAS 线上编译安卓            | `eas build --platform android`                                     |
| 使用 EAS 线上编译 iOS            | `eas build --platform ios`                                         |
| 调试运行安卓 App                 | `yarn android`                                                     |
| 调试运行 iOS App                 | `yarn ios`                                                         |

## gradle 镜像

```
    maven { url 'https://maven.aliyun.com/repository/google' }
    maven { url 'https://maven.aliyun.com/repository/jcenter' }
    maven { url 'https://maven.aliyun.com/repository/public' }
```

## Windows 上打包存在的长路径问题

由于 `@lodev09/react-native-true-sheet` 等 node_modules 依赖包的路径过长，导致 Windows 系统上打包时，很容易遇到 CMake 所使用的 Ninja 构建工具报错，提示路径过长。

这是一个已知的生态系统级问题，由于 expo 默认捆绑的 CMake 版本过低（3.22.1），其内置的 Ninja 版本为1.10.2，尚不支持 Windows 的长路径功能。

相关联的 issue 如下：

- https://github.com/ninja-build/ninja/issues/1900
- https://github.com/expo/expo/issues/36274

在此问题解决之前，在 Windows 系统上打包只有以下3种解决方案：

1. 将项目路径移动到更短的位置，例如 `C:\proj`。
2. 使用 Windows 子系统 Linux (WSL) 来进行打包。
3. 启用 Windows 的长路径支持，然后手动下载 Ninja 1.12.1，并替换 Android SDK 中的 ninja.exe，然后将将下载的 ninja.exe 复制到 $cmakeBin

下载地址：

https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip

替换地址：

%LOCALAPPDATA%\Android\Sdk\cmake\3.22.1\bin\ninja.exe

或者运行此 [PowerShell 脚本](./scripts/upgrade-ninja.ps1) 来自动完成替换。

使用示例

```
# 自动检测并升级
.\scripts\upgrade-ninja.ps1

# 指定 SDK 路径
.\scripts\upgrade-ninja.ps1 -AndroidSdkPath "C:\Android\Sdk"

# 强制升级（跳过确认）
.\scripts\upgrade-ninja.ps1 -Force

# 恢复原始版本
.\scripts\upgrade-ninja.ps1 -Restore
```
