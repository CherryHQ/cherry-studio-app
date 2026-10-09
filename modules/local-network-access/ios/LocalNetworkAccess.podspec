Pod::Spec.new do |s|
  s.name = 'LocalNetworkAccess'
  s.version = '1.0.0'
  s.summary = 'Local network access preparation for Cherry Studio'
  s.description = 'Triggers local network authorization and lets pairing wait for connectivity.'
  s.author = 'Cherry Studio'
  s.homepage = 'https://github.com/kangfenmao/cherry-studio'
  s.platforms = { :ios => '17.0' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'UIKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
