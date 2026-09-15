Pod::Spec.new do |s|
  s.name = 'GmailAuthorization'
  s.version = '1.0.0'
  s.summary = 'Native Gmail authorization for Cherry Studio'
  s.description = 'Uses Google Sign-In for on-device read-only Gmail access.'
  s.author = 'Cherry Studio'
  s.homepage = 'https://github.com/kangfenmao/cherry-studio'
  s.platforms = { :ios => '17.0' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'GoogleSignIn', '~> 9.0'
  s.dependency 'AppAuth', '~> 2.0'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
