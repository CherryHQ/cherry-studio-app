Pod::Spec.new do |s|
  s.name = 'Diagnostics'
  s.version = '1.0.0'
  s.summary = 'Local diagnostic recording and system document export'
  s.description = s.summary
  s.author = 'Cherry Studio'
  s.homepage = 'https://github.com/CherryHQ/cherry-studio-app'
  s.platforms = { :ios => '17.0' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CryptoKit', 'MetricKit', 'UniformTypeIdentifiers'
  s.source_files = '**/*.swift'
end
