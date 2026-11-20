Pod::Spec.new do |s|
  s.name = 'AppStoreUpdate'
  s.version = '1.0.0'
  s.summary = 'App Store storefront for iOS update checks'
  s.description = s.summary
  s.author = 'Cherry Studio'
  s.homepage = 'https://github.com/CherryHQ/cherry-studio-app'
  s.platforms = { :ios => '17.0' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'StoreKit'
  s.source_files = '**/*.swift'
end
