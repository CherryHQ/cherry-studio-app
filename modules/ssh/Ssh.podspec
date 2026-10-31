require 'open3'

# Local :path pods do not run prepare_command; resolve sources before CocoaPods scans them.
ssh2_source, status = Open3.capture2(ENV.fetch('NODE_BINARY', 'node'), File.join(__dir__, 'prepareLibssh2.cjs'))
raise '[Ssh] Could not prepare the pinned libssh2 source' unless status.success?
ssh2_source = ssh2_source.strip

Pod::Spec.new do |s|
  s.name = 'Ssh'
  s.version = '1.0.0'
  s.summary = 'Bounded SSH operations using libssh2'
  s.author = 'Cherry Studio'
  s.homepage = 'https://github.com/CherryHQ/cherry-studio-app'
  s.platforms = { :ios => '17.0' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'QuickCrypto', '1.1.8'
  s.source_files = 'ios/**/*.{h,mm,swift}', 'cpp/**/*.{h,cpp}', "#{ssh2_source}/src/*.{h,c}"
  # blowfish.c is included by bcrypt_pbkdf.c, not a separate translation unit.
  s.exclude_files = "#{ssh2_source}/src/blowfish.c"
  s.preserve_paths = '.cache/**/*'
  s.resource_bundles = { 'SshLicenses' => ['licenses/*'] }
  s.public_header_files = 'ios/SshRunner.h'
  crypto = File.realpath(File.join(__dir__, '../../node_modules/react-native-quick-crypto'))
  prefix = File.join(crypto, 'ios/openssl/quickcrypto_openssl_prefix.h')
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'GCC_C_LANGUAGE_STANDARD' => 'gnu11',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) HAVE_CONFIG_H LIBSSH2_OPENSSL LIBSSH2_NO_AES_CBC',
    'HEADER_SEARCH_PATHS' => "\"$(PODS_TARGET_SRCROOT)/cpp\" \"$(PODS_TARGET_SRCROOT)/#{ssh2_source}/include\" \"$(PODS_TARGET_SRCROOT)/#{ssh2_source}/src\" \"#{crypto}/ios/openssl/include\"",
    # Resolve to QuickCrypto's namespaced static OpenSSL, never another pod's symbols.
    'OTHER_CFLAGS' => "$(inherited) -include \"#{prefix}\"",
    'OTHER_CPLUSPLUSFLAGS' => "$(inherited) -include \"#{prefix}\"",
  }
end
