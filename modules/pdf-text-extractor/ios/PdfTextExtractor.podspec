Pod::Spec.new do |s|
  s.name           = 'PdfTextExtractor'
  s.version        = '1.0.0'
  s.summary        = 'Native PDF text extraction module for iOS'
  s.description    = 'Expo module providing PDF text extraction using iOS PDFKit framework'
  s.author         = 'Cherry Studio'
  s.homepage       = 'https://github.com/kangfenmao/cherry-studio'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'PDFKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
