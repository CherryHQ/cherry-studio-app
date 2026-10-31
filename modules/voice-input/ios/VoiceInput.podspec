Pod::Spec.new do |s|
  s.name = 'VoiceInput'
  s.version = '1.0.0'
  s.summary = 'Offline dictation audio capture for Cherry Studio'
  s.description = 'Bounded PCM WAV recording and private downloaded voice model storage.'
  s.author = 'Cherry Studio'
  s.homepage = 'https://github.com/CherryHQ/cherry-studio-app'
  s.platforms = { :ios => '17.0' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'Speech', 'UIKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
