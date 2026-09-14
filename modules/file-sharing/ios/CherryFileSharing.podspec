Pod::Spec.new do |s|
  s.name = 'CherryFileSharing'
  s.version = '1.0.0'
  s.summary = 'Multi-file system sharing for Cherry Studio'
  s.description = 'Presents ordered local files in one system share sheet.'
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
