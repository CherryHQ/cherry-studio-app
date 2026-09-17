const fs = require('node:fs');
const path = require('node:path');
const {
  AndroidConfig,
  IOSConfig,
  withAndroidManifest,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');

const TARGETS = [
  { name: 'CherryShareExtension', source: 'ShareExtension', minimum: '17.0' },
  { name: 'CherryTranslationExtension', source: 'TranslationExtension', minimum: '18.4' },
];

function xml(value) {
  const escape = (text) =>
    String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  if (typeof value === 'boolean') return value ? '<true/>' : '<false/>';
  if (typeof value === 'number') return `<integer>${value}</integer>`;
  if (typeof value === 'string') return `<string>${escape(value)}</string>`;
  if (Array.isArray(value)) return `<array>${value.map(xml).join('')}</array>`;
  return `<dict>${Object.entries(value)
    .map(([key, item]) => `<key>${escape(key)}</key>${xml(item)}`)
    .join('')}</dict>`;
}

function writePlist(file, value) {
  fs.writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${xml(value)}</plist>\n`,
  );
}

module.exports = (config) => {
  const bundle = config.ios.bundleIdentifier;
  const group = `group.${bundle}.system-integration`;
  const keychain = `$(AppIdentifierPrefix)${bundle}.system-integration`;
  const sharedInfo = {
    CherrySystemIntegrationGroup: group,
    CherrySystemIntegrationKeychainGroup: keychain,
    'com.apple.developer.translation-ui-provider.network-access': true,
  };
  const sharedEntitlements = {
    'com.apple.security.application-groups': [group],
    'keychain-access-groups': [keychain],
  };
  config = withEntitlementsPlist(config, (mod) => {
    const entitlements = mod.modResults;
    entitlements['com.apple.security.application-groups'] = [
      ...new Set([...(entitlements['com.apple.security.application-groups'] ?? []), group]),
    ];
    // Preserve the app's default Keychain namespace before adding the extension's narrow group.
    entitlements['keychain-access-groups'] = [
      ...new Set([
        ...(entitlements['keychain-access-groups'] ?? [`$(AppIdentifierPrefix)${bundle}`]),
        keychain,
      ]),
    ];
    entitlements['com.apple.developer.translation-app'] = true;
    return mod;
  });
  config = withInfoPlist(config, (mod) => {
    Object.assign(mod.modResults, sharedInfo);
    return mod;
  });
  config = withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const root = mod.modRequest.platformProjectRoot;
    const source = path.join(mod.modRequest.projectRoot, 'modules/system-integration/ios');
    const main = project.getFirstTarget().uuid;
    const mainFolder = 'CherrySystemIntegration';
    fs.mkdirSync(path.join(root, mainFolder), { recursive: true });
    for (const [file, from, resource] of [
      ['CherryAppIntents.swift', 'AppIntents', false],
      ['SystemIntegration.xcstrings', 'Resources', true],
      ['Localizable.xcstrings', 'Resources', true],
      ['AppShortcuts.xcstrings', 'Resources', true],
    ]) {
      fs.copyFileSync(path.join(source, from, file), path.join(root, mainFolder, file));
      IOSConfig.XcodeUtils.ensureGroupRecursively(project, mainFolder);
      const options = {
        filepath: `${mainFolder}/${file}`,
        groupName: mainFolder,
        project,
        targetUuid: main,
        isBuildFile: true,
      };
      if (resource) IOSConfig.XcodeUtils.addResourceFileToGroup(options);
      else IOSConfig.XcodeUtils.addBuildSourceFileToGroup(options);
    }
    for (const target of TARGETS) {
      const directory = path.join(root, target.name);
      fs.mkdirSync(directory, { recursive: true });
      for (const child of ['Core', target.source, 'Resources']) {
        fs.cpSync(path.join(source, child), path.join(directory, child), { recursive: true });
      }
      const translation = target.source === 'TranslationExtension';
      writePlist(path.join(directory, 'Info.plist'), {
        CFBundleDevelopmentRegion: 'en',
        CFBundleDisplayName: translation ? 'Cherry Translate' : 'Cherry Studio',
        CFBundleExecutable: '$(EXECUTABLE_NAME)',
        CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
        CFBundleInfoDictionaryVersion: '6.0',
        CFBundleName: '$(PRODUCT_NAME)',
        CFBundlePackageType: 'XPC!',
        CFBundleShortVersionString: '$(MARKETING_VERSION)',
        CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
        ...sharedInfo,
        ...(translation
          ? {
              EXAppExtensionAttributes: {
                EXExtensionPointIdentifier: 'com.apple.public.translation-ui-provider',
              },
            }
          : {
              NSExtension: {
                NSExtensionPointIdentifier: 'com.apple.share-services',
                NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).CherryShareViewController',
                NSExtensionAttributes: {
                  NSExtensionActivationRule: {
                    NSExtensionActivationSupportsText: true,
                    NSExtensionActivationSupportsWebURLWithMaxCount: 10,
                    NSExtensionActivationSupportsImageWithMaxCount: 10,
                    NSExtensionActivationSupportsFileWithMaxCount: 10,
                  },
                },
              },
            }),
      });
      writePlist(path.join(directory, `${target.name}.entitlements`), sharedEntitlements);
      writePlist(path.join(directory, 'PrivacyInfo.xcprivacy'), {
        NSPrivacyTracking: false,
        NSPrivacyCollectedDataTypes: [],
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
            NSPrivacyAccessedAPITypeReasons: ['C617.1'],
          },
        ],
      });
      let entry = Object.entries(project.pbxNativeTargetSection()).find(
        ([key, value]) =>
          !key.endsWith('_comment') && value.name?.replaceAll('"', '') === target.name,
      );
      if (!entry) {
        const added = project.addTarget(
          target.name,
          'app_extension',
          target.name,
          `${bundle}.${target.name}`,
        );
        entry = [added.uuid, added.pbxNativeTarget];
        const sources = ['Core', target.source].flatMap((child) =>
          fs
            .readdirSync(path.join(source, child))
            .filter((file) => file.endsWith('.swift'))
            .map((file) => `${target.name}/${child}/${file}`),
        );
        project.addBuildPhase(sources, 'PBXSourcesBuildPhase', 'Sources', added.uuid);
        project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', added.uuid);
        project.addBuildPhase(
          [
            `${target.name}/Resources/SystemIntegration.xcstrings`,
            `${target.name}/PrivacyInfo.xcprivacy`,
          ],
          'PBXResourcesBuildPhase',
          'Resources',
          added.uuid,
        );
        if (translation) {
          // xcode's addTarget only knows legacy extensions. ExtensionKit uses a distinct product and embed directory.
          const product = added.pbxNativeTarget.productReference;
          const buildFiles = project.pbxBuildFileSection();
          const embed = project.addBuildPhase(
            [],
            'PBXCopyFilesBuildPhase',
            'Embed Cherry Translation',
            main,
            'app_extension',
          );
          embed.buildPhase.dstSubfolderSpec = 16;
          embed.buildPhase.dstPath = '"$(CONTENTS_FOLDER_PATH)/Extensions"';
          for (const phase of Object.values(project.hash.project.objects.PBXCopyFilesBuildPhase)) {
            if (!phase?.files || phase === embed.buildPhase) continue;
            const moved = phase.files.filter((file) => buildFiles[file.value]?.fileRef === product);
            phase.files = phase.files.filter((file) => buildFiles[file.value]?.fileRef !== product);
            embed.buildPhase.files.push(...moved);
          }
        }
      }
      const [uuid, nativeTarget] = entry;
      if (translation) nativeTarget.productType = '"com.apple.product-type.extensionkit-extension"';
      const list = project.pbxXCConfigurationList()[nativeTarget.buildConfigurationList];
      for (const item of list.buildConfigurations) {
        const build = project.pbxXCBuildConfigurationSection()[item.value];
        Object.assign(build.buildSettings, {
          PRODUCT_BUNDLE_IDENTIFIER: `"${bundle}.${target.name}"`,
          PRODUCT_NAME: '"$(TARGET_NAME)"',
          INFOPLIST_FILE: `"${target.name}/Info.plist"`,
          GENERATE_INFOPLIST_FILE: 'NO',
          CODE_SIGN_ENTITLEMENTS: `"${target.name}/${target.name}.entitlements"`,
          CODE_SIGN_STYLE: 'Automatic',
          DEVELOPMENT_TEAM: config.ios.appleTeamId ?? '',
          IPHONEOS_DEPLOYMENT_TARGET: target.minimum,
          CURRENT_PROJECT_VERSION: config.ios.buildNumber ?? '1',
          MARKETING_VERSION: config.version ?? '1.0',
          SWIFT_VERSION: '5.0',
          SWIFT_EMIT_LOC_STRINGS: 'YES',
          TARGETED_DEVICE_FAMILY: '"1,2"',
          APPLICATION_EXTENSION_API_ONLY: 'YES',
          SKIP_INSTALL: 'YES',
        });
      }
      project.getFirstProject().firstProject.attributes.TargetAttributes ??= {};
      project.getFirstProject().firstProject.attributes.TargetAttributes[uuid] = {
        ProvisioningStyle: 'Automatic',
      };
    }
    // xcode 3 predates string catalogs and privacy manifests; explicitly preserve their compiler types.
    for (const file of Object.values(project.pbxFileReferenceSection())) {
      if (!file || typeof file !== 'object') continue;
      const filePath = file.path?.replaceAll('"', '') ?? '';
      if (!filePath.startsWith('Cherry')) continue;
      if (filePath.endsWith('.xcstrings')) file.lastKnownFileType = 'text.json.xcstrings';
      if (filePath.endsWith('.xcprivacy')) file.lastKnownFileType = 'text.xml';
    }
    return mod;
  });
  config = withAndroidManifest(config, (mod) => {
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    const metadata = (main['meta-data'] ??= []);
    const item = metadata.find((entry) => entry.$['android:name'] === 'android.app.shortcuts');
    if (item) item.$['android:resource'] = '@xml/cherry_shortcuts';
    else
      metadata.push({
        $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/cherry_shortcuts' },
      });
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    (mod) => {
      const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(directory, { recursive: true });
      const entries = [
        ['new_chat', 'chat.open'],
        ['new_painting', 'painting.open'],
      ]
        .map(
          ([id, kind]) => `
  <shortcut android:shortcutId="cherry_${id}" android:enabled="true" android:shortcutShortLabel="@string/cherry_${id}" android:icon="@mipmap/ic_launcher">
    <intent android:action="android.intent.action.VIEW" android:targetPackage="${config.android.package}" android:targetClass="expo.modules.systemintegration.ShortcutEntryActivity">
      <extra android:name="kind" android:value="${kind}" />
    </intent>
  </shortcut>`,
        )
        .join('');
      fs.writeFileSync(
        path.join(directory, 'cherry_shortcuts.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">${entries}\n</shortcuts>\n`,
      );
      return mod;
    },
  ]);
};
