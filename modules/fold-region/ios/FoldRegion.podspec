Pod::Spec.new do |s|
  s.name           = 'FoldRegion'
  s.version        = '1.0.0'
  s.summary        = 'Reports where a foldable display divides the window (iOS)'
  s.description    = 'Expo module view that reports the division reserved region in window coordinates'
  s.author         = 'Cherry Studio'
  s.homepage       = 'https://github.com/cherryhq/cherry-studio-app'
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
