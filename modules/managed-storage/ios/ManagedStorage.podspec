Pod::Spec.new do |s|
  s.name = 'ManagedStorage'
  s.version = '1.0.0'
  s.summary = 'Persistent application-support storage roots for Cherry Studio'
  s.description = 'Exposes the Application Support directory for app-owned resources such as Skill packages.'
  s.author = 'Cherry Studio'
  s.homepage = 'https://github.com/kangfenmao/cherry-studio'
  s.platforms = { :ios => '17.0' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
