const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const {
  AndroidConfig,
  IOSConfig,
  withAndroidManifest,
  withDangerousMod,
  withXcodeProject,
} = require('expo/config-plugins');

const ENTERPRISE_BLUE = '#0C5DFF';
const ALIASES = ['CommunityLauncher', 'EnterpriseLauncher'];
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

function launcherFilter() {
  return {
    action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
    category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
  };
}

async function enterpriseImage(projectRoot, size) {
  return sharp(path.join(projectRoot, 'assets/enterprise-icon.png'))
    .resize(size, size)
    .flatten({ background: ENTERPRISE_BLUE })
    .png()
    .toBuffer();
}

function withAndroidAppIcons(config, enabled) {
  config = withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    application['activity-alias'] = (application['activity-alias'] ?? []).filter(
      (entry) => !ALIASES.some((name) => entry.$['android:name'] === `.${name}`),
    );
    const filters = main['intent-filter'] ?? [];
    if (!enabled) {
      if (
        !filters.some((filter) =>
          filter.category?.some(
            (entry) => entry.$['android:name'] === 'android.intent.category.LAUNCHER',
          ),
        )
      )
        filters.push(launcherFilter());
      main['intent-filter'] = filters;
      return mod;
    }
    main['intent-filter'] = filters.filter(
      (filter) =>
        !filter.category?.some(
          (entry) => entry.$['android:name'] === 'android.intent.category.LAUNCHER',
        ),
    );
    for (const [index, name] of ALIASES.entries()) {
      application['activity-alias'].push({
        $: {
          'android:name': `.${name}`,
          'android:targetActivity': main.$['android:name'],
          'android:enabled': String(index === 0),
          'android:exported': 'true',
          'android:icon': index === 0 ? '@mipmap/ic_launcher' : '@mipmap/ic_launcher_enterprise',
        },
        'intent-filter': [launcherFilter()],
      });
    }
    return mod;
  });
  if (!enabled) return config;
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const root = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res');
      for (const [density, size] of Object.entries(DENSITIES)) {
        const folder = path.join(root, `mipmap-${density}`);
        await fs.mkdir(folder, { recursive: true });
        await fs.writeFile(
          path.join(folder, 'ic_launcher_enterprise.png'),
          await enterpriseImage(mod.modRequest.projectRoot, size),
        );
        const foregroundSize = Math.round((size * 108) / 48);
        const artworkSize = Math.round(foregroundSize * 0.6);
        const artwork = await enterpriseImage(mod.modRequest.projectRoot, artworkSize);
        const foreground = await sharp({
          create: {
            width: foregroundSize,
            height: foregroundSize,
            channels: 4,
            background: ENTERPRISE_BLUE,
          },
        })
          .composite([{ input: artwork, gravity: 'centre' }])
          .png()
          .toBuffer();
        await fs.writeFile(path.join(folder, 'ic_launcher_enterprise_foreground.png'), foreground);
      }
      const adaptive = path.join(root, 'mipmap-anydpi-v26');
      await fs.mkdir(adaptive, { recursive: true });
      await fs.writeFile(
        path.join(adaptive, 'ic_launcher_enterprise.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n' +
          '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n' +
          '  <background android:drawable="@color/cherry_enterprise_icon_background"/>\n' +
          '  <foreground android:drawable="@mipmap/ic_launcher_enterprise_foreground"/>\n' +
          '  <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n' +
          '</adaptive-icon>\n',
      );
      await fs.mkdir(path.join(root, 'values'), { recursive: true });
      await fs.writeFile(
        path.join(root, 'values/cherry_app_icon.xml'),
        `<resources><color name="cherry_enterprise_icon_background">${ENTERPRISE_BLUE}</color></resources>\n`,
      );
      return mod;
    },
  ]);
}

module.exports = (config, { androidEnabled = true } = {}) => {
  config = withAndroidAppIcons(config, androidEnabled);
  config = withXcodeProject(config, (mod) => {
    for (const section of Object.values(mod.modResults.pbxXCBuildConfigurationSection())) {
      const settings = section.buildSettings;
      if (
        !settings ||
        String(settings.ASSETCATALOG_COMPILER_APPICON_NAME).replace(/"/g, '') !== 'AppIcon'
      )
        continue;
      const names = String(settings.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES ?? '')
        .replace(/"/g, '')
        .split(/\s+/)
        .filter(Boolean);
      settings.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = `"${[...new Set([...names, 'Enterprise'])].join(' ')}"`;
    }
    return mod;
  });
  return withDangerousMod(config, [
    'ios',
    async (mod) => {
      const folder = path.join(
        IOSConfig.Paths.getSourceRoot(mod.modRequest.projectRoot),
        'Images.xcassets/Enterprise.appiconset',
      );
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(
        path.join(folder, 'enterprise.png'),
        await enterpriseImage(mod.modRequest.projectRoot, 1024),
      );
      await fs.writeFile(
        path.join(folder, 'Contents.json'),
        JSON.stringify(
          {
            images: [
              {
                filename: 'enterprise.png',
                idiom: 'universal',
                platform: 'ios',
                size: '1024x1024',
              },
            ],
            info: { version: 1, author: 'expo' },
          },
          null,
          2,
        ) + '\n',
      );
      return mod;
    },
  ]);
};
