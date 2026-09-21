const fs = require('node:fs');
const path = require('node:path');
const { withEntitlementsPlist, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const TARGETS = [{ name: 'CherryShareExtension', source: 'ShareExtension', minimum: '17.0' }];

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
  const sharedInfo = { CherrySystemIntegrationGroup: group };
  const sharedEntitlements = {
    'com.apple.security.application-groups': [group],
  };
  config = withEntitlementsPlist(config, (mod) => {
    const entitlements = mod.modResults;
    entitlements['com.apple.security.application-groups'] = [
      ...new Set([...(entitlements['com.apple.security.application-groups'] ?? []), group]),
    ];
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
    for (const target of TARGETS) {
      const directory = path.join(root, target.name);
      fs.mkdirSync(directory, { recursive: true });
      for (const child of ['Core', target.source, 'Resources']) {
        fs.cpSync(path.join(source, child), path.join(directory, child), { recursive: true });
      }
      writePlist(path.join(directory, 'Info.plist'), {
        CFBundleDevelopmentRegion: 'en',
        CFBundleDisplayName: 'Cherry Studio',
        CFBundleExecutable: '$(EXECUTABLE_NAME)',
        CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
        CFBundleInfoDictionaryVersion: '6.0',
        CFBundleName: '$(PRODUCT_NAME)',
        CFBundlePackageType: 'XPC!',
        CFBundleShortVersionString: '$(MARKETING_VERSION)',
        CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
        ...sharedInfo,
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
      }
      const [uuid, nativeTarget] = entry;
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
  return config;
};
