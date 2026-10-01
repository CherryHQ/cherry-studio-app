Pod::Spec.new do |s|
  s.name           = 'JsSandbox'
  s.version        = '1.0.0'
  s.summary        = 'Isolated Hermes runtime for model-written JavaScript'
  s.description    = 'Runs untrusted JavaScript in a fresh, hardened Hermes runtime per call on its own thread'
  s.author         = 'Cherry Studio'
  s.homepage       = 'https://github.com/CherryHQ/cherry-studio-app'
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # JSI and the Hermes public API both ship in hermes-engine; React-jsi only
  # forwards to it when React Native uses Hermes.
  s.dependency 'hermes-engine'
  s.dependency 'React-jsi'

  s.source_files = 'ios/**/*.{h,mm,swift}', 'cpp/**/*.{h,cpp}'
  # Swift imports the Objective-C bridge only; the C++ core stays private.
  s.public_header_files = 'ios/JsSandboxRunner.h'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'HEADER_SEARCH_PATHS' => '"$(PODS_ROOT)/hermes-engine/destroot/include" "$(PODS_TARGET_SRCROOT)/cpp"',
  }
end
