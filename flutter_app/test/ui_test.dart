import 'package:al_balag_poc/app.dart';
import 'package:al_balag_poc/core/providers.dart';
import 'package:al_balag_poc/features/chat/chat_controller.dart';
import 'package:al_balag_poc/features/meeting/meeting_controller.dart';
import 'package:al_balag_poc/features/meeting/meeting_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fakes.dart';

Future<(Widget, FakeChatService, FakeMeetingService)> _app({Map<String, Object> prefs = const {}}) async {
  SharedPreferences.setMockInitialValues(prefs);
  final p = await SharedPreferences.getInstance();
  final chat = FakeChatService();
  final meeting = FakeMeetingService();
  return (
    ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(p),
        chatServiceProvider.overrideWithValue(chat),
        meetingServiceProvider.overrideWithValue(meeting),
      ],
      child: const App(),
    ),
    chat,
    meeting,
  );
}

void main() {
  testWidgets('login validates the user id, then opens the chat', (tester) async {
    final (app, chat, _) = await _app();
    chat.history = [msg('1', 'Welcome to the room', sender: 'bob')];
    await tester.pumpWidget(app);

    await tester.tap(find.text('Continue'));
    await tester.pump();
    expect(find.text('Enter a user id'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).first, 'alice');
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('POC Demo Room'), findsOneWidget);
    expect(find.text('Welcome to the room'), findsOneWidget);
    expect(find.text('bob'), findsOneWidget);
  });

  testWidgets('already signed-in users go straight to the app', (tester) async {
    final (app, _, _) = await _app(prefs: {'user_id': 'alice', 'display_name': 'Alice'});
    await tester.pumpWidget(app);
    await tester.pumpAndSettle();
    expect(find.text('Login'), findsNothing);
    expect(find.byType(NavigationBar), findsOneWidget);
  });

  testWidgets('sending a message shows it in the list', (tester) async {
    final (app, chat, _) = await _app(prefs: {'user_id': 'alice'});
    await tester.pumpWidget(app);
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, '').last, 'Hello team');
    await tester.pump();
    await tester.tap(find.byTooltip('Send'));
    await tester.pumpAndSettle();

    expect(chat.sent, ['Hello team']);
    expect(find.text('Hello team'), findsOneWidget);
  });

  testWidgets('a failed message offers a retry', (tester) async {
    final (app, chat, _) = await _app(prefs: {'user_id': 'alice'});
    chat.sendError = Exception('offline');
    await tester.pumpWidget(app);
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, '').last, 'Are you there?');
    await tester.pump();
    await tester.tap(find.byTooltip('Send'));
    await tester.pumpAndSettle();
    expect(find.text('Not sent. Tap to retry'), findsOneWidget);

    chat.sendError = null;
    await tester.tap(find.text('Not sent. Tap to retry'));
    await tester.pumpAndSettle();
    expect(find.text('Not sent. Tap to retry'), findsNothing);
    expect(chat.sent, ['Are you there?']);
  });

  testWidgets('chat shows an error with a retry when Sendbird is unreachable', (tester) async {
    final (app, chat, _) = await _app(prefs: {'user_id': 'alice'});
    chat.connectError = Exception('no network');
    await tester.pumpWidget(app);
    await tester.pumpAndSettle();

    expect(find.textContaining('no network'), findsOneWidget);
    chat.connectError = null;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('POC Demo Room'), findsOneWidget);
    expect(find.textContaining('no network'), findsNothing);
  });

  testWidgets('meeting tab validates input and joins with the signed-in name', (tester) async {
    final (app, _, meeting) = await _app(prefs: {'user_id': 'alice', 'display_name': 'Alice A'});
    await tester.pumpWidget(app);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Meeting').last);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Join meeting'));
    await tester.pump();
    expect(find.text('Enter the meeting number'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'Meeting number'), '81234567890');
    await tester.tap(find.text('Join meeting'));
    await tester.pump();
    await tester.pump();

    expect(find.text('Joining\u2026'), findsOneWidget);
    // Zoom reports progress; the in-meeting banner shows and the form unlocks after it ends.
    meeting.updates.add(const MeetingStatusUpdate(status: 'InMeeting'));
    await tester.pump();
    expect(find.text('You are in a meeting.'), findsOneWidget);
    meeting.updates.add(const MeetingStatusUpdate(status: 'Ended'));
    await tester.pumpAndSettle();

    expect(meeting.joined.single.number, '81234567890');
    expect(meeting.joined.single.name, 'Alice A');
    expect(find.text('812 3456 7890'), findsWidgets); // remembered under "Recent"
  });

  testWidgets('sign out returns to the login screen and disconnects chat', (tester) async {
    final (app, chat, _) = await _app(prefs: {'user_id': 'alice'});
    await tester.pumpWidget(app);
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Account'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();

    expect(find.text('AL Balag POC'), findsOneWidget);
    expect(chat.disconnected, isTrue);
  });
}
