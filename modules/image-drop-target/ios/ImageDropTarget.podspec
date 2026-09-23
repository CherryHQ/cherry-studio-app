Pod::Spec.new do |s|
  s.name           = 'ImageDropTarget'
  s.version        = '1.0.0'
  s.summary        = 'System drag-and-drop image receiving for the chat composer (iOS)'
  s.description    = 'Expo module view that accepts image drops from other apps and hands the copied files to JS'
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
