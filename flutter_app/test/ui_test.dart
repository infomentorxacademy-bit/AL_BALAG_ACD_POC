import 'package:al_balag_poc/app.dart';
import 'package:al_balag_poc/core/providers.dart';
import 'package:al_balag_poc/features/chat/chat_providers.dart';
import 'package:al_balag_poc/features/chat/chat_service.dart';
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
        imagePickerProvider.overrideWithValue(() async => null),
      ],
      child: const App(),
    ),
    chat,
    meeting,
  );
}

/// Signed-in app, with the demo room opened.
Future<(FakeChatService, FakeMeetingService)> _openDemoRoom(WidgetTester tester) async {
  final (app, chat, meeting) = await _app(prefs: {'user_id': 'alice'});
  chat.history = [msg('5', 'Who has the schedule?', sender: 'bob')];
  await tester.pumpWidget(app);
  await tester.pumpAndSettle();
  await tester.tap(find.text('POC Demo Room'));
  await tester.pumpAndSettle();
  return (chat, meeting);
}

Future<void> _type(WidgetTester tester, String text) async {
  await tester.enterText(find.byType(TextField), text);
  await tester.pump();
}

void main() {
  testWidgets('login validates the user id, then shows the chat list', (tester) async {
    final (app, _, _) = await _app();
    await tester.pumpWidget(app);

    await tester.tap(find.text('Continue'));
    await tester.pump();
    expect(find.text('Enter a user id'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).first, 'alice');
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('POC Demo Room'), findsOneWidget);
    expect(find.text('bob: Welcome to the room'), findsOneWidget);
  });

  testWidgets('already signed-in users go straight to the app', (tester) async {
    final (app, _, _) = await _app(prefs: {'user_id': 'alice', 'display_name': 'Alice'});
    await tester.pumpWidget(app);
    await tester.pumpAndSettle();
    expect(find.text('Login'), findsNothing);
    expect(find.byType(NavigationBar), findsOneWidget);
  });

  testWidgets('the chat list shows unread badges, newest chat first, and an empty state', (tester) async {
    final (app, chat, _) = await _app(prefs: {'user_id': 'alice'});
    chat.channels = [
      chan(url: 'a', title: 'Old chat', lastMessage: 'old news', at: DateTime(2026, 1, 1)),
      chan(url: 'b', title: 'Busy chat', lastMessage: 'new stuff', at: DateTime(2026, 1, 3), unread: 3),
    ];
    await tester.pumpWidget(app);
    await tester.pumpAndSettle();

    expect(find.text('3'), findsOneWidget);
    final busy = tester.getTopLeft(find.text('Busy chat')).dy;
    final old = tester.getTopLeft(find.text('Old chat')).dy;
    expect(busy, lessThan(old));

    chat.emit(const ChannelRemoved('a'));
    chat.emit(const ChannelRemoved('b'));
    await tester.pumpAndSettle();
    expect(find.text('No chats yet'), findsOneWidget);
  });

  testWidgets('opening a chat shows its messages and clears the unread badge', (tester) async {
    final (app, chat, _) = await _app(prefs: {'user_id': 'alice'});
    chat.channels = [chan(unread: 2)];
    chat.history = [msg('5', 'Who has the schedule?', sender: 'bob')];
    await tester.pumpWidget(app);
    await tester.pumpAndSettle();
    expect(find.text('2'), findsOneWidget);

    await tester.tap(find.text('POC Demo Room'));
    await tester.pumpAndSettle();
    expect(find.text('Who has the schedule?'), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('2'), findsNothing);
  });

  testWidgets('sending a message shows it in the conversation', (tester) async {
    final (chat, _) = await _openDemoRoom(tester);

    await _type(tester, 'Hello team');
    await tester.tap(find.byTooltip('Send'));
    await tester.pumpAndSettle();

    expect(chat.sent, ['Hello team']);
    expect(find.text('Hello team'), findsOneWidget);
  });

  testWidgets('a failed message offers a retry', (tester) async {
    final (chat, _) = await _openDemoRoom(tester);
    chat.sendError = Exception('offline');

    await _type(tester, 'Are you there?');
    await tester.tap(find.byTooltip('Send'));
    await tester.pumpAndSettle();
    expect(find.text('Not sent. Tap to retry'), findsOneWidget);

    chat.sendError = null;
    await tester.tap(find.text('Not sent. Tap to retry'));
    await tester.pumpAndSettle();
    expect(find.text('Not sent. Tap to retry'), findsNothing);
    expect(chat.sent, ['Are you there?']);
  });

  testWidgets('the chat list shows an error with a retry when Sendbird is unreachable', (tester) async {
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

  testWidgets('a new message from someone else shows live, with a typing indicator before it', (tester) async {
    final (chat, _) = await _openDemoRoom(tester);

    chat.emit(const TypingChanged(demoUrl, ['bob']));
    await tester.pumpAndSettle();
    expect(find.text('bob is typing…'), findsWidgets);

    chat.emit(const TypingChanged(demoUrl, []));
    chat.emit(MessageReceived(demoUrl, msg('6', 'Right here!', sender: 'bob', at: DateTime(2026, 1, 1, 13))));
    await tester.pumpAndSettle();
    expect(find.text('Right here!'), findsOneWidget);
    expect(find.text('bob is typing…'), findsNothing);
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

    expect(find.text('Joining the meeting\u2026'), findsWidgets);
    // Zoom reports progress; the meeting card shows, and the join form returns after it ends.
    meeting.updates.add(const MeetingStatusUpdate(status: 'InMeeting'));
    await tester.pump();
    expect(find.text('You are in a meeting'), findsOneWidget);
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

  group('message actions', () {
    testWidgets('long-press a message, reply to it, and the reply shows the quote', (tester) async {
      final (chat, _) = await _openDemoRoom(tester);

      await tester.longPress(find.text('Who has the schedule?'));
      await tester.pumpAndSettle();
      expect(find.text('Copy'), findsOneWidget);
      await tester.tap(find.text('Reply'));
      await tester.pumpAndSettle();
      expect(find.text('Replying to bob'), findsOneWidget);

      await _type(tester, 'I do');
      await tester.tap(find.byTooltip('Send'));
      await tester.pumpAndSettle();

      expect(chat.replies.single?.messageId, '5');
      expect(find.text('Replying to bob'), findsNothing); // bar closed
      // The original appears twice now: once as the message, once quoted inside the reply.
      expect(find.text('Who has the schedule?'), findsNWidgets(2));
      expect(find.text('I do'), findsOneWidget);
    });

    testWidgets('the reply bar can be cancelled', (tester) async {
      await _openDemoRoom(tester);
      await tester.longPress(find.text('Who has the schedule?'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Reply'));
      await tester.pumpAndSettle();
      expect(find.text('Replying to bob'), findsOneWidget);

      await tester.tap(find.byTooltip('Cancel reply'));
      await tester.pumpAndSettle();
      expect(find.text('Replying to bob'), findsNothing);
    });

    testWidgets('react with an emoji, and tap the chip to take it back', (tester) async {
      await _openDemoRoom(tester);
      await tester.longPress(find.text('Who has the schedule?'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('\u{1F44D}'));
      await tester.pumpAndSettle();

      expect(find.text('\u{1F44D} 1'), findsOneWidget);

      await tester.tap(find.text('\u{1F44D} 1'));
      await tester.pumpAndSettle();
      expect(find.text('\u{1F44D} 1'), findsNothing);
    });

    testWidgets('edit my own message', (tester) async {
      final (app, chat, _) = await _app(prefs: {'user_id': 'alice'});
      chat.history = [msg('7', 'Meeting at 9', mine: true)];
      await tester.pumpWidget(app);
      await tester.pumpAndSettle();
      await tester.tap(find.text('POC Demo Room'));
      await tester.pumpAndSettle();

      await tester.longPress(find.text('Meeting at 9'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit'));
      await tester.pumpAndSettle();
      expect(find.text('Editing message'), findsOneWidget);
      expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, 'Meeting at 9');

      await _type(tester, 'Meeting at 10');
      await tester.tap(find.byTooltip('Save'));
      await tester.pumpAndSettle();

      expect(chat.edits.single, (id: '7', text: 'Meeting at 10'));
      expect(find.text('Meeting at 10'), findsOneWidget);
      expect(find.text('edited  '), findsOneWidget);
      expect(find.text('Editing message'), findsNothing);
    });

    testWidgets('delete my own message after confirming', (tester) async {
      final (app, chat, _) = await _app(prefs: {'user_id': 'alice'});
      chat.history = [msg('7', 'Oops wrong chat', mine: true)];
      await tester.pumpWidget(app);
      await tester.pumpAndSettle();
      await tester.tap(find.text('POC Demo Room'));
      await tester.pumpAndSettle();

      await tester.longPress(find.text('Oops wrong chat'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(find.text('Delete message?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
      await tester.pumpAndSettle();

      expect(chat.deleted, ['7']);
      expect(find.text('Oops wrong chat'), findsNothing);
    });

    testWidgets("other people's messages offer neither Edit nor Delete", (tester) async {
      await _openDemoRoom(tester);
      await tester.longPress(find.text('Who has the schedule?'));
      await tester.pumpAndSettle();
      expect(find.text('Edit'), findsNothing);
      expect(find.text('Delete'), findsNothing);
    });
  });

  group('new chat', () {
    testWidgets('start a direct chat by user id', (tester) async {
      final (app, chat, _) = await _app(prefs: {'user_id': 'alice'});
      await tester.pumpWidget(app);
      await tester.pumpAndSettle();

      await tester.tap(find.text('New chat'));
      await tester.pumpAndSettle();
      expect(find.text('Start chat'), findsOneWidget);

      await tester.enterText(find.widgetWithText(TextField, 'User id(s)'), 'bob');
      await tester.pump();
      await tester.tap(find.text('Start chat'));
      await tester.pumpAndSettle();

      expect(chat.created.single.ids, ['bob']);
      // Now inside the new conversation.
      expect(find.text('No messages yet.\nSay hello \u{1F44B}'), findsOneWidget);
    });

    testWidgets('several ids make a group and ask for a name', (tester) async {
      final (app, chat, _) = await _app(prefs: {'user_id': 'alice'});
      await tester.pumpWidget(app);
      await tester.pumpAndSettle();

      await tester.tap(find.text('New chat'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'User id(s)'), 'bob, carol alice');
      await tester.pump();
      expect(find.text('Create group'), findsOneWidget);
      await tester.enterText(find.widgetWithText(TextField, 'Group name (optional)'), 'Project X');
      await tester.tap(find.text('Create group'));
      await tester.pumpAndSettle();

      // Your own id is dropped from the member list.
      expect(chat.created.single.ids, ['bob', 'carol']);
      expect(chat.created.single.name, 'Project X');
    });

    testWidgets('a failure is explained in the sheet', (tester) async {
      final (app, chat, _) = await _app(prefs: {'user_id': 'alice'});
      chat.createError = Exception('user not found');
      await tester.pumpWidget(app);
      await tester.pumpAndSettle();

      await tester.tap(find.text('New chat'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'User id(s)'), 'nobody');
      await tester.pump();
      await tester.tap(find.text('Start chat'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Could not start the chat'), findsOneWidget);
      expect(find.text('Start chat'), findsOneWidget); // still open, can fix the id
    });
  });

  testWidgets('leaving a chat from the list asks first', (tester) async {
    final (app, chat, _) = await _app(prefs: {'user_id': 'alice'});
    await tester.pumpWidget(app);
    await tester.pumpAndSettle();

    await tester.longPress(find.text('POC Demo Room'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Leave "POC Demo Room"?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Leave'));
    await tester.pumpAndSettle();

    expect(chat.left, [demoUrl]);
    expect(find.text('POC Demo Room'), findsNothing);
  });

  group('a meeting that keeps running while you use the app', () {
    Future<FakeMeetingService> joinAndGetIn(WidgetTester tester) async {
      final (app, _, meeting) = await _app(prefs: {'user_id': 'alice', 'display_name': 'Alice A'});
      await tester.pumpWidget(app);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Meeting').last);
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextFormField, 'Meeting number'), '81234567890');
      await tester.tap(find.text('Join meeting'));
      await tester.pump(const Duration(milliseconds: 100)); // not settled: the join watchdog must not fire
      meeting.updates.add(const MeetingStatusUpdate(status: 'InMeeting'));
      await tester.pumpAndSettle();
      return meeting;
    }

    testWidgets('the Meeting tab becomes a card with a Return button', (tester) async {
      final meeting = await joinAndGetIn(tester);
      expect(find.text('You are in a meeting'), findsOneWidget);
      expect(find.text('812 3456 7890'), findsWidgets);
      expect(find.text('Join meeting'), findsNothing); // the form is out of the way
      expect(find.textContaining('minimize button'), findsOneWidget);

      await tester.tap(find.text('Return to meeting'));
      await tester.pumpAndSettle();
      expect(meeting.returned, 1);
    });

    testWidgets('on the Chats tab a green bar offers Return, and chat still works', (tester) async {
      final meeting = await joinAndGetIn(tester);
      await tester.tap(find.text('Chats').last);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('meeting-bar')), findsOneWidget);
      expect(find.textContaining('In a meeting'), findsOneWidget);

      await tester.tap(find.text('Return'));
      await tester.pumpAndSettle();
      expect(meeting.returned, 1);

      // The chat list is fully usable meanwhile, and the bar follows you around.
      await tester.tap(find.text('POC Demo Room'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('meeting-bar')), findsNothing, reason: 'a conversation is its own full screen');
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('meeting-bar')), findsOneWidget);
    });

    testWidgets('when the meeting ends the bar disappears and the join form comes back', (tester) async {
      final meeting = await joinAndGetIn(tester);
      meeting.updates.add(const MeetingStatusUpdate(status: 'Ended'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('meeting-bar')), findsNothing);
      expect(find.text('Join meeting'), findsOneWidget);
    });

    testWidgets('minimizing keeps the meeting running', (tester) async {
      final meeting = await joinAndGetIn(tester);
      meeting.minimizedEvents.add(null);
      await tester.pumpAndSettle();
      expect(find.text('You are in a meeting'), findsOneWidget);
    });

    testWidgets('the card warns when the floating window is not allowed, with a way to allow it', (tester) async {
      final meeting = await joinAndGetIn(tester);
      meeting.overlay = false;
      // Coming back to the app re-checks the permission.
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(find.textContaining('floating window is off'), findsOneWidget);
      await tester.tap(find.text('Allow floating window'));
      await tester.pumpAndSettle();
      expect(meeting.overlaySettingsOpened, 1);
    });
  });

  group('floating window permission', () {
    Future<FakeMeetingService> toMeetingTab(WidgetTester tester, {required bool overlay}) async {
      final (app, _, meeting) = await _app(prefs: {'user_id': 'alice'});
      meeting.overlay = overlay;
      await tester.pumpWidget(app);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Meeting').last);
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextFormField, 'Meeting number'), '81234567890');
      return meeting;
    }

    testWidgets('missing: it explains, and Allow opens Settings without joining yet', (tester) async {
      final meeting = await toMeetingTab(tester, overlay: false);
      await tester.tap(find.text('Join meeting'));
      await tester.pumpAndSettle();
      expect(find.text('Keep the meeting in a small window?'), findsOneWidget);

      await tester.tap(find.text('Allow'));
      await tester.pumpAndSettle();
      expect(meeting.overlaySettingsOpened, 1);
      expect(meeting.joined, isEmpty, reason: 'the user must allow it first, then tap Join again');
      expect(find.textContaining('tap Join meeting again'), findsOneWidget);
    });

    testWidgets('Not now still lets the meeting start, and it does not ask again', (tester) async {
      final meeting = await toMeetingTab(tester, overlay: false);
      await tester.tap(find.text('Join meeting'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Not now'));
      await tester.pumpAndSettle();
      expect(meeting.joined.single.number, '81234567890');

      meeting.updates.add(const MeetingStatusUpdate(status: 'InMeeting'));
      await tester.pumpAndSettle();
      meeting.updates.add(const MeetingStatusUpdate(status: 'Ended'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextFormField, 'Meeting number'), '81234567890');
      await tester.tap(find.text('Join meeting'));
      await tester.pumpAndSettle();
      expect(find.text('Keep the meeting in a small window?'), findsNothing);
      expect(meeting.joined, hasLength(2));
    });

    testWidgets('already allowed: no question, it just joins', (tester) async {
      final meeting = await toMeetingTab(tester, overlay: true);
      await tester.tap(find.text('Join meeting'));
      await tester.pumpAndSettle();
      expect(find.text('Keep the meeting in a small window?'), findsNothing);
      expect(meeting.joined, hasLength(1));
    });
  });
}
