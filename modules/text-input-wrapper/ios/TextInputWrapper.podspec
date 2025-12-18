Pod::Spec.new do |s|
  s.name           = 'TextInputWrapper'
  s.version        = '1.0.0'
  s.summary        = 'Native text input wrapper with paste event handling'
  s.description    = 'Expo module providing cross-platform paste event detection for text inputs with support for text and image content'
  s.author         = 'Arunabh Verma'
  s.homepage       = 'https://github.com/arunabhverma/expo-paste-input'
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: 'https://github.com/arunabhverma/expo-paste-input.git', tag: "v#{s.version}" }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
