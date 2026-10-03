Pod::Spec.new do |s|
  s.name             = 'zoom_meeting_bridge'
  s.version          = '0.1.0'
  s.summary          = 'Thin Flutter bridge to the official Zoom Meeting SDK.'
  s.description      = 'Joins Zoom meetings with a server-signed SDK JWT using the official ZoomMeetingSDK pod.'
  s.homepage         = 'https://developers.zoom.us/docs/meeting-sdk/'
  s.license          = { :type => 'MIT', :file => '../LICENSE' }
  s.author           = { 'AL Balag Academy POC' => 'info.mentorxacademy@gmail.com' }
  s.source           = { :path => '.' }
  s.source_files     = 'Classes/**/*.{h,m}'
  s.public_header_files = 'Classes/**/*.h'
  s.dependency 'Flutter'
  # Official Zoom Meeting SDK (same version as the Android artifact).
  s.dependency 'ZoomMeetingSDK', '7.0.5'
  s.platform = :ios, '15.0'
  s.static_framework = true

  # Flutter.framework does not contain a i386 slice.
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'i386' }
end
