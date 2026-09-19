# 🍃 به برنامه Cherry Studio خوش آمدید

persian | [English](./README.md) | [中文](./README-zh.md) 

🍃 برنامه Cherry Studio — نسخه رسمی موبایل Cherry Studio که تعامل با مدل‌های زبانی بزرگ (LLM) را به دستگاه‌های iOS و اندروید شما می‌آورد.

🌟 **حمایت از پروژه:** [حمایت مالی](https://github.com/CherryHQ/cherry-studio/blob/main/docs/zh/guides/sponsor.md) | به این مخزن ستاره بدهید!

## ✨ ویژگی‌های کلیدی

- **پشتیبانی از چندین ارائه‌دهنده LLM**: (به‌تدریج در حال اضافه شدن) OpenAI، Gemini، Anthropic و موارد دیگر.
- **دستیارها و مکالمات هوش مصنوعی**: دسترسی به دستیارهای از پیش تنظیم شده و انجام مکالمات روان با مدل‌های مختلف.
- **بهینه‌سازی شده برای موبایل**: طراحی ویژه برای iOS/اندروید با پشتیبانی از تم روشن/تاریک.
- **ابزارهای اصلی**: مدیریت مکالمات، جستجوی تاریخچه، انتقال داده‌ها.

## 🛠️ مجموعه فناوری‌ها

- **چارچوب**: Expo React Native
- **مدیر بسته**: Pnpm
- **رابط کاربری**: Tamagui
- **مسیریابی**: React Navigation
- **مدیریت وضعیت**: Redux Toolkit

## 🚀 شروع توسعه

> مستندات مربوط به توسعه در پوشه docs قرار دارد.

1. **کلون کردن مخزن**

   ```bash
    git clone https://github.com/CherryHQ/cherry-studio-app.git
   ```

2. **ورود به دایرکتوری**

   ```bash
    cd cherry-studio-app
   ```

3. **نصب وابستگی‌ها**

   ```bash
    pnpm install
   ```

4. **ایجاد پایگاه داده**

```bash
npx drizzle-kit generate
```

5. **ساخت MCP Streamable Http**

```bash
cd packages/react-native-streamable-http
npm install
npm run build
```

6. **راه‌اندازی برنامه**

iOS:

```bash
npx expo prebuild -p ios

cd ios # اضافه کردن گواهی خودامضا

npx expo run:ios -d
```

اندروید:

```bash
npx expo prebuild -p android

cd android # اضافه کردن مسیر Android SDK به فایل local.properties

npx expo run:android -d
```

### تنظیمات Android SDK

#### برای کاربران ویندوز:

```
sdk.dir=C:\\Users\\UserName\\AppData\\Local\\Android\\sdk
```

یا (برای نسخه‌های جدیدتر Android Studio / IntelliJ IDEA):

```
sdk.dir=C\:\\Users\\USERNAME\\AppData\\Local\\Android\\sdk
```

که در آن USERNAME نام کاربری شما در رایانه است. همچنین مطمئن شوید نام پوشه sdk یا Sdk باشد.

مثال:

```
sdk.dir=C:\\Users\\USERNAME\\AppData\\Local\\Android\\sdk
```

یا:

```
sdk.dir=C\:\\Users\\USERNAME\\AppData\\Local\\Android\\Sdk
```

#### برای کاربران مک:

```
sdk.dir = /Users/USERNAME/Library/Android/sdk
```

که USERNAME نام کاربری OSX شما است.

همچنین می‌توانید از متغیرهای محیطی در مسیر خود استفاده کنید، مثلاً:

```bash
export ANDROID_HOME=/Users/$(whoami)/Library/Android/sdk
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools"
```

#### برای کاربران لینوکس (اوبونتو):

```
sdk.dir = /home/USERNAME/Android/Sdk
```

که USERNAME نام کاربری لینوکس شما است.

> لطفاً برای توسعه از دستگاه‌های فیزیکی یا شبیه‌ساز استفاده کنید، از Expo Go استفاده نکنید.
