Pod::Spec.new do |s|
  s.name = 'BackupStorage'
  s.version = '1.0.0'
  s.summary = 'Durable local backup storage primitives'
  s.description = 'Process identity, atomic control records, file hashing and durable staging.'
  s.author = 'Cherry Studio'
  s.homepage = 'https://github.com/CherryHQ/cherry-studio-app'
  s.platforms = { :ios => '17.0' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
