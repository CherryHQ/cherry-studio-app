Pod::Spec.new do |s|
  s.name           = 'JsSandbox'
  s.version        = '1.0.0'
  s.summary        = 'Isolated QuickJS runtime for model-written JavaScript'
  s.description    = 'Runs untrusted JavaScript in a fresh QuickJS runtime per call on its own thread'
  s.author         = 'Cherry Studio'
  s.homepage       = 'https://github.com/CherryHQ/cherry-studio-app'
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # cpp/QuickJs.c compiles the vendored engine; vendor/ itself is not a source.
  s.source_files = 'ios/**/*.{h,mm,swift}', 'cpp/**/*.{h,c,cpp}'
  s.preserve_paths = 'vendor/**/*'
  # Swift imports the Objective-C bridge only; the C++ core stays private.
  s.public_header_files = 'ios/JsSandboxRunner.h'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'GCC_C_LANGUAGE_STANDARD' => 'gnu11',
    # Debug builds too: at -O0 QuickJS runs about 9x slower and its larger
    # frames cut the recursion depth that fits in the stack from ~7,000 to ~800.
    'GCC_OPTIMIZATION_LEVEL' => '2',
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/cpp" "$(PODS_TARGET_SRCROOT)/vendor/quickjs-ng"',
  }
end
