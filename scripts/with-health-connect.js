const { withAndroidManifest } = require('expo/config-plugins');

const rationaleAction = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';
const permissionUsageAction = 'android.intent.action.VIEW_PERMISSION_USAGE';
const permissionUsageAlias = '.HealthConnectPermissionUsageActivity';

module.exports = function withHealthConnect(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const application = androidConfig.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('Android application manifest is missing');
    }

    const mainActivity = application.activity?.find((activity) =>
      activity['intent-filter']?.some((filter) =>
        filter.action?.some(
          (action) => action.$?.['android:name'] === 'android.intent.action.MAIN',
        ),
      ),
    );
    if (!mainActivity) {
      throw new Error('Android main activity is missing');
    }

    mainActivity['intent-filter'] = [
      ...(mainActivity['intent-filter'] ?? []).filter(
        (filter) =>
          !filter.action?.some((action) => action.$?.['android:name'] === rationaleAction),
      ),
      {
        action: [{ $: { 'android:name': rationaleAction } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      },
    ];

    application['activity-alias'] = [
      ...(application['activity-alias'] ?? []).filter(
        (alias) => alias.$?.['android:name'] !== permissionUsageAlias,
      ),
      {
        $: {
          'android:exported': 'true',
          'android:name': permissionUsageAlias,
          'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
          'android:targetActivity': '.MainActivity',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': permissionUsageAction } }],
            category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
          },
        ],
      },
    ];

    return androidConfig;
  });
};
