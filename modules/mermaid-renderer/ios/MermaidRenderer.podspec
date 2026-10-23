Pod::Spec.new do |s|
  s.name = 'MermaidRenderer'
  s.version = '1.0.0'
  s.summary = 'Native Mermaid rendering for CherryUI'
  s.description = 'Presentation-only Mermaid parsing, layout, and SVG generation.'
  s.author = 'Cherry Studio'
  s.homepage = 'https://github.com/CherryHQ/cherry-studio-app'
  s.platforms = { :ios => '17.0' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.frameworks = 'UIKit', 'CherryMermaid'
  s.libraries = 'c++'

  # The Kotlin static framework is produced before Swift compilation. It is staged in the
  # shared products directory so both this pod and the final app linker can resolve it.
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'ENABLE_USER_SCRIPT_SANDBOXING' => 'NO',
    'FRAMEWORK_SEARCH_PATHS' => '$(inherited) "$(PODS_CONFIGURATION_BUILD_DIR)"',
  }
  s.user_target_xcconfig = {
    'FRAMEWORK_SEARCH_PATHS' => '$(inherited) "$(PODS_CONFIGURATION_BUILD_DIR)"',
  }
  s.script_phase = {
    :name => 'Build Cherry Mermaid framework',
    :execution_position => :before_compile,
    :shell_path => '/bin/sh',
    :script => 'sh "${PODS_TARGET_SRCROOT}/build-framework.sh"',
    :always_out_of_date => '1',
    :output_files => [
      '${PODS_CONFIGURATION_BUILD_DIR}/CherryMermaid.framework/CherryMermaid',
      '${PODS_CONFIGURATION_BUILD_DIR}/CherryMermaid.framework/Headers/CherryMermaid.h',
      '${PODS_CONFIGURATION_BUILD_DIR}/CherryMermaid.framework/Modules/module.modulemap',
    ],
  }
end
