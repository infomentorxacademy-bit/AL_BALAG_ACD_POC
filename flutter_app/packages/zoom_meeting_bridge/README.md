# zoom_meeting_bridge

A deliberately small Flutter plugin around the official **Zoom Meeting SDK** (Android and iOS).

- Android: depends on `us.zoom.meetingsdk:zoomsdk` from Maven Central.
- iOS: depends on the `ZoomMeetingSDK` CocoaPod.
- No manual SDK downloads.

```dart
final zoom = ZoomMeetingBridge();
zoom.events.listen((e) { /* ZoomAuthEvent, ZoomMeetingStatusEvent, ... */ });

await zoom.initialize(jwtToken: jwtFromYourServer);
// wait for ZoomAuthEvent with success == true, then:
final result = await zoom.joinMeeting(
  meetingNumber: '81234567890',
  displayName: 'Alice',
  password: 'passcode',
);
```

The JWT must be signed on a server with your SDK secret. See `../../../server`.
Use of the Zoom SDK is subject to the [Zoom license terms](https://explore.zoom.us/en/legal/zoom-api-license-and-tou/).
