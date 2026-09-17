Pod::Spec.new do |s|
  s.name = 'SystemIntegration'
  s.version = '1.0.0'
  s.summary = 'System entry points and temporary translation for Cherry Mobile'
  s.description = 'Native, independently runnable translation and bounded share handoff.'
  s.author = 'Cherry Studio'
  s.homepage = 'https://github.com/CherryHQ/cherry-studio-app'
  s.platforms = { :ios => '17.0' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Foundation', 'Security', 'SwiftUI', 'UIKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = 'Core/**/*.swift', 'SystemIntegrationModule.swift'
end
