require 'json'

# Compile against the Sentry Cocoa build that @sentry/react-native links, so the app carries one
# native SDK. Sentry Cocoa 9.20+ ships only as a prebuilt xcframework, which RNSentry downloads
# and exposes to its own pod and the app target; this pod needs the same framework search paths.
sentry_package = JSON.parse(
  `node --print "JSON.stringify(require.resolve('@sentry/react-native/package.json', { paths: ['#{__dir__}'] }))"`
)
sentry_root = File.dirname(sentry_package)
require File.join(sentry_root, 'scripts', 'sentry_utils.rb')
sentry_cocoa_version = File.read(File.join(sentry_root, 'RNSentry.podspec'))[/sentry_cocoa_version = '([^']+)'/, 1]
sentry_xcframework_dir = ensure_sentry_xcframework(sentry_cocoa_version, 'Sentry')
sentry_xcframework = stage_sentry_xcframework_in_pods(sentry_xcframework_dir, sentry_cocoa_version, 'Sentry') ||
  sentry_xcframework_dir
sentry_search_paths = %w[iphoneos iphonesimulator].to_h do |sdk|
  slices = SENTRY_XCFRAMEWORK_SLICES_BY_SDK.fetch(sdk).map { |slice| %("#{File.join(sentry_xcframework, slice)}") }
  ["FRAMEWORK_SEARCH_PATHS[sdk=#{sdk}*]", (['$(inherited)'] + slices).join(' ')]
end

Pod::Spec.new do |s|
  s.name = 'CrashReporting'
  s.version = '1.0.0'
  s.summary = 'Consent and filtering for Cherry Studio native crash reports'
  s.description = s.summary
  s.author = 'Cherry Studio'
  s.homepage = 'https://github.com/CherryHQ/cherry-studio-app'
  s.platforms = { :ios => '17.0' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  # RNSentry links the framework into the app; this pod only compiles against it.
  s.dependency 'RNSentry'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }.merge(sentry_search_paths)
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
