Pod::Spec.new do |s|
  s.name = 'RelaySocket'
  s.version = '1.0.0'
  s.summary = 'Bounded Relay WebSocket transport'
  s.description = 'TLS WebSocket transport with native send completion and bounded bridge delivery.'
  s.author = 'Cherry Studio'
  s.homepage = 'https://github.com/CherryHQ/cherry-studio-app'
  s.platforms = { :ios => '17.0' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
