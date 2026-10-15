Pod::Spec.new do |s|
  s.name = 'HealthAccess'
  s.version = '1.0.0'
  s.summary = 'Health data authorization for Cherry Studio'
  s.description = 'Requests read access without claiming to know HealthKit read grants.'
  s.author = 'Cherry Studio'
  s.homepage = 'https://github.com/kangfenmao/cherry-studio'
  s.platforms = { :ios => '17.0' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
