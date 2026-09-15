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
  # Match @sentry/react-native 7.11.0; keep one native SDK.
  s.dependency 'Sentry/HybridSDK', '8.58.0'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
