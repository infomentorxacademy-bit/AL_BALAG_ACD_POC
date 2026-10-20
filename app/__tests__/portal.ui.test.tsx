import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('../src/controllers', () => {
  const t = require('./testApp');
  return {
    channelList: t.channelList,
    conversation: t.conversation,
    activeMeeting: t.activeMeeting,
    chatService: t.fake,
    sessionStore: t.sessionStore,
    api: t.api,
    portal: t.portal,
  };
});
jest.mock('../src/screens/ZoomRoom', () => {
  const { useEffect } = require('react');
  const t = require('./testApp');
  return {
    __esModule: true,
    default: (p: { meetingNumber: string; onJoinResult: (r: string) => void }) => {
      useEffect(() => {
        t.joined.push(p.meetingNumber);
        p.onJoinResult(t.joinResult.value);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    },
  };
});

import App from '../App';
import { chan, msg } from '../tests/fakes';
import { activeMeeting, backend, channelList, fake, joined, portal, resetFake, resetSession, sessionStore } from './testApp';

type User = ReturnType<typeof userEvent.setup>;

beforeEach(async () => {
  resetFake();
  resetSession();
  await channelList.stop();
  await AsyncStorage.clear();
  fake.channels = [chan({ lastMessage: 'bob: Welcome to the room' })];
  fake.history = [msg('1', 'Welcome to the room')];
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  portal.stop();
});

async function open(userId = 'alice', role: 'admin' | 'user' = 'user'): Promise<User> {
  backend.users.set(userId, { display_name: userId, role });
  await AsyncStorage.multiSet([
    ['user_id', userId],
    ['display_name', userId],
    ['auth_token', `tok-${userId}-${role}`],
    ['user_role', role],
  ]);
  await render(<App />);
  await screen.findByText(/^Good (morning|afternoon|evening|night),/);
  return userEvent.setup();
}
const goTo = (user: User, tab: string) => user.press(screen.getByLabelText(`${tab} tab`));

describe('login against the backend', () => {
  test('a wrong admin key is explained and nothing is saved', async () => {
    await render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText(/User id/), 'boss');
    await user.press(screen.getByText('Advanced (server, admin)'));
    await user.type(screen.getByPlaceholderText('Admin key'), 'wrong');
    await user.press(screen.getByText('Continue'));
    expect(await screen.findByText(/Wrong admin key/)).toBeTruthy();
    expect(await AsyncStorage.getItem('auth_token')).toBeNull();
  });

  test('the right admin key signs in as admin', async () => {
    await render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText(/User id/), 'boss');
    await user.press(screen.getByText('Advanced (server, admin)'));
    await user.type(screen.getByPlaceholderText('Admin key'), 'letmein');
    await user.press(screen.getByText('Continue'));
    await screen.findByText(/^Good (morning|afternoon|evening|night),/);
    expect(await AsyncStorage.getItem('user_role')).toBe('admin');
    await goTo(userEvent.setup(), 'Profile');
    expect(await screen.findByText('Admin')).toBeTruthy();
  });

  test('an unreachable server gets advice, and the server address can be changed on the login screen', async () => {
    backend.down = true;
    await render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText(/User id/), 'alice');
    await user.press(screen.getByText('Advanced (server, admin)'));
    const server = screen.getByPlaceholderText('http://192.168.1.20:8000');
    await user.clear(server);
    await user.type(server, '192.168.1.20:8000');
    await user.press(screen.getByText('Continue'));
    expect(await screen.findByText(/Cannot reach the server at http:\/\/192\.168\.1\.20:8000/)).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy(); // can try again
  });

  test('a session saved before accounts existed (no token) asks to sign in again', async () => {
    await AsyncStorage.multiSet([
      ['user_id', 'alice'],
      ['display_name', 'Alice'],
    ]);
    await render(<App />);
    expect(await screen.findByText('Continue')).toBeTruthy();
  });

  test('when the server stops accepting the token the person is signed out', async () => {
    const user = await open();
    backend.failNext.set('/announcements', 401);
    await act(async () => portal.refresh());
    expect(await screen.findByText('Continue')).toBeTruthy();
    expect(sessionStore.state.session).toBeNull();
    expect(fake.disconnected).toBe(true);
    expect(user).toBeTruthy();
  });
});

describe('home', () => {
  test('greets by first name and shows the next meeting with a Join button', async () => {
    backend.seedMeeting({ title: 'Maths class', startsInMin: 120 });
    const user = await open();
    expect(await screen.findByText('Maths class')).toBeTruthy();
    expect(screen.getByText('NEXT MEETING')).toBeTruthy();
    await user.press(screen.getByLabelText('join next meeting'));
    await waitFor(() => expect(joined).toEqual(['81234567890']));
    const sig = backend.calls.find((c) => c.path === '/zoom/signature');
    expect(sig).toBeTruthy();
    expect(activeMeeting.state.session?.password).toBe('abc123'); // passcode comes from the schedule
  });

  test('a meeting that is about to start says HAPPENING NOW', async () => {
    backend.seedMeeting({ title: 'Live class', startsInMin: 3 });
    await open();
    expect(await screen.findByText('HAPPENING NOW')).toBeTruthy();
    expect(screen.getByText('Join now')).toBeTruthy();
  });

  test('past meetings are not offered; with nothing scheduled it points to Join with ID', async () => {
    backend.seedMeeting({ title: 'Old', startsInMin: -300, durationMin: 30 });
    await open();
    expect(await screen.findByText('Nothing scheduled')).toBeTruthy();
    expect(screen.queryByText('Old')).toBeNull();
  });

  test('shows unread counts and the latest announcements; tiles open the right tab', async () => {
    backend.seedAnnouncement({ title: 'Exam timetable', body: 'Out now' });
    const user = await open();
    expect(await screen.findByText(/Exam timetable/)).toBeTruthy();
    expect(screen.getByText('new announcement')).toBeTruthy();
    await user.press(screen.getByLabelText('open announcements'));
    expect(await screen.findByLabelText('announcement Exam timetable')).toBeTruthy();
  });

  test('during a meeting the card turns into Return to meeting', async () => {
    backend.seedMeeting({ title: 'Class', startsInMin: 120 });
    const user = await open();
    await user.press(await screen.findByLabelText('join next meeting'));
    await waitFor(() => expect(joined.length).toBe(1));
    await act(async () => activeMeeting.onJoinResult('MEETING_ERROR_SUCCESS'));
    expect(await screen.findByText('IN A MEETING')).toBeTruthy();
  });

  test('the Android back button goes Chats -> Home', async () => {
    const user = await open();
    await goTo(user, 'Chats');
    const { BackHandler } = require('react-native');
    await act(async () => BackHandler.mockPressBack?.());
    // Home is shown again when the handler ran (mockPressBack exists in the RN jest setup).
    if (BackHandler.mockPressBack) expect(await screen.findByText(/^Good/)).toBeTruthy();
  });
});

describe('announcements', () => {
  test('a member sees them newest-first with unread markers, and tapping marks one read', async () => {
    backend.seedAnnouncement({ title: 'First', at: '2026-01-01T10:00:00Z' });
    backend.seedAnnouncement({ title: 'Second', at: '2026-01-02T10:00:00Z' });
    const user = await open();
    await goTo(user, 'News');
    const cards = await screen.findAllByLabelText(/^announcement /);
    expect(cards.map((c) => c.props.accessibilityLabel)).toEqual(['announcement Second', 'announcement First']);
    expect(screen.getAllByLabelText('unread')).toHaveLength(2);

    await user.press(screen.getByLabelText('announcement Second'));
    await waitFor(() => expect(screen.getAllByLabelText('unread')).toHaveLength(1));
    expect(backend.readBy.get(backend.announcements.find((a) => a.title === 'Second').id)?.has('alice')).toBe(true);
  });

  test('a member has no compose button and no delete', async () => {
    backend.seedAnnouncement({ title: 'Hello' });
    const user = await open();
    await goTo(user, 'News');
    await screen.findByLabelText('announcement Hello');
    expect(screen.queryByText(/New announcement/)).toBeNull();
    expect(screen.queryByLabelText('delete Hello')).toBeNull();
  });

  test('"Mark all as read" clears every dot', async () => {
    backend.seedAnnouncement({ title: 'A' });
    backend.seedAnnouncement({ title: 'B' });
    const user = await open();
    await goTo(user, 'News');
    await user.press(await screen.findByText('Mark all 2 as read'));
    await waitFor(() => expect(screen.queryAllByLabelText('unread')).toHaveLength(0));
  });

  test('an empty list explains what will appear', async () => {
    const user = await open();
    await goTo(user, 'News');
    expect(await screen.findByText('No announcements yet')).toBeTruthy();
  });

  test('a new announcement while the app is open flashes a banner; tapping it opens News', async () => {
    const user = await open();
    await goTo(user, 'Chats');
    backend.seedAnnouncement({ title: 'Class cancelled', body: 'Because rain' });
    await act(async () => portal.refresh());
    expect(await screen.findByLabelText('notification')).toBeTruthy();
    expect(screen.getByText('New announcement: Class cancelled')).toBeTruthy();
    await user.press(screen.getByText('New announcement: Class cancelled'));
    expect(await screen.findByLabelText('announcement Class cancelled')).toBeTruthy();
    expect(screen.queryByLabelText('notification')).toBeNull();
  });

  test('the banner can be dismissed', async () => {
    const user = await open();
    backend.seedAnnouncement({ title: 'Heads up' });
    await act(async () => portal.refresh());
    await user.press(await screen.findByLabelText('Dismiss notification'));
    expect(screen.queryByLabelText('notification')).toBeNull();
  });

  test('News shows a retry bar when the server is down, keeping what it had', async () => {
    backend.seedAnnouncement({ title: 'Kept' });
    const user = await open();
    await goTo(user, 'News');
    await screen.findByLabelText('announcement Kept');
    backend.down = true;
    await act(async () => portal.refresh());
    expect(await screen.findByText(/Could not refresh/)).toBeTruthy();
    expect(screen.getByLabelText('announcement Kept')).toBeTruthy();
  });
});

describe('announcements as an admin', () => {
  test('compose, validate, send, and it appears for everyone', async () => {
    const user = await open('boss', 'admin');
    await goTo(user, 'News');
    await user.press(await screen.findByLabelText('new announcement'));
    await user.press(await screen.findByText('Send to everyone'));
    expect(await screen.findByText('Enter a title')).toBeTruthy();

    await user.type(screen.getByPlaceholderText('Title'), 'Holiday');
    await user.press(screen.getByText('Send to everyone'));
    expect(await screen.findByText('Write the announcement')).toBeTruthy();

    await user.type(screen.getByPlaceholderText('Message'), 'School is closed on Friday');
    await user.press(screen.getByText('Send to everyone'));
    expect(await screen.findByLabelText('announcement Holiday')).toBeTruthy();
    expect(backend.announcements.map((a) => a.title)).toEqual(['Holiday']);
    expect(backend.announcements[0].author_id).toBe('boss');
  });

  test('a server refusal is shown inside the composer and the text is kept', async () => {
    const user = await open('boss', 'admin');
    await goTo(user, 'News');
    await user.press(await screen.findByLabelText('new announcement'));
    await user.type(screen.getByPlaceholderText('Title'), 'T');
    await user.type(screen.getByPlaceholderText('Message'), 'B');
    backend.failNext.set('/announcements', 500);
    await user.press(screen.getByText('Send to everyone'));
    expect(await screen.findByText(/Could not send: forced 500/)).toBeTruthy();
    expect(screen.getByDisplayValue('T')).toBeTruthy();
  });

  test('delete asks first, then removes it', async () => {
    backend.seedAnnouncement({ title: 'Remove me' });
    (Alert.alert as jest.Mock).mockImplementation((_t, _m, buttons) => buttons?.find((b: { text: string }) => b.text === 'Delete')?.onPress?.());
    const user = await open('boss', 'admin');
    await goTo(user, 'News');
    await user.press(await screen.findByLabelText('delete Remove me'));
    await waitFor(() => expect(screen.queryByLabelText('announcement Remove me')).toBeNull());
    expect(backend.announcements).toHaveLength(0);
  });
});

describe('scheduled meetings', () => {
  test('a member sees what is meant for them, and Join uses the stored number and passcode', async () => {
    backend.seedMeeting({ title: 'For everyone', startsInMin: 90 });
    backend.seedMeeting({ title: 'Only bob', startsInMin: 100, assignees: ['bob'] });
    backend.seedMeeting({ title: 'Only alice', startsInMin: 110, assignees: ['alice'], number: '99988877766', passcode: 'zzz' });
    const user = await open();
    await goTo(user, 'Meetings');
    expect(await screen.findByLabelText('meeting For everyone')).toBeTruthy();
    expect(screen.getByLabelText('meeting Only alice')).toBeTruthy();
    expect(screen.queryByLabelText('meeting Only bob')).toBeNull();
    expect(screen.queryByLabelText('delete Only alice')).toBeNull(); // not an admin

    await user.press(screen.getByLabelText('join Only alice'));
    await waitFor(() => expect(joined).toEqual(['99988877766']));
    expect(activeMeeting.state.session?.password).toBe('zzz');
  });

  test('a meeting starting soon is marked LIVE; one within the hour SOON', async () => {
    backend.seedMeeting({ title: 'Now', startsInMin: 2 });
    backend.seedMeeting({ title: 'Later', startsInMin: 40 });
    const user = await open();
    await goTo(user, 'Meetings');
    await screen.findByLabelText('meeting Now');
    expect(screen.getByText('LIVE')).toBeTruthy();
    expect(screen.getByText('SOON')).toBeTruthy();
  });

  test('a failed join (server down) is explained on the schedule', async () => {
    backend.seedMeeting({ title: 'Class' });
    const user = await open();
    await goTo(user, 'Meetings');
    await screen.findByLabelText('meeting Class');
    backend.down = true;
    await user.press(screen.getByLabelText('join Class'));
    expect(await screen.findByText(/Cannot reach the server/)).toBeTruthy();
    expect(joined).toEqual([]);
  });

  test('with nothing scheduled a member is pointed to Join with ID', async () => {
    const user = await open();
    await goTo(user, 'Meetings');
    expect(await screen.findByText('No meetings scheduled')).toBeTruthy();
    expect(screen.getAllByText(/Join with ID/).length).toBeGreaterThan(0);
  });

  test('an admin schedules a meeting: validation, then saved for the chosen people', async () => {
    const user = await open('boss', 'admin');
    await goTo(user, 'Meetings');
    await user.press(await screen.findByLabelText('schedule meeting'));
    await user.press(await screen.findByText('Save meeting'));
    expect(await screen.findByText('Enter a title')).toBeTruthy();

    await user.type(screen.getByPlaceholderText(/Title/), 'Physics');
    await user.type(screen.getByPlaceholderText('Zoom meeting number'), '123');
    await user.press(screen.getByText('Save meeting'));
    expect(await screen.findByText('A meeting number has 9 to 11 digits')).toBeTruthy();

    await user.clear(screen.getByPlaceholderText('Zoom meeting number'));
    await user.type(screen.getByPlaceholderText('Zoom meeting number'), '812 3456 7890');
    await user.type(screen.getByPlaceholderText('Passcode (optional)'), 'pw1');
    await user.type(screen.getByPlaceholderText(/Who\?/), 'alice, bob');
    await user.press(screen.getByText('In 1 hour'));
    await user.press(screen.getByText('Save meeting'));

    expect(await screen.findByLabelText('meeting Physics')).toBeTruthy();
    const saved = backend.meetings[0];
    expect(saved.meeting_number).toBe('81234567890');
    expect(saved.passcode).toBe('pw1');
    expect(saved.assignees).toEqual(['alice', 'bob']);
    expect(saved.duration_minutes).toBe(60);
    const start = new Date(saved.start_time).getTime();
    expect(Math.abs(start - (Date.now() + 3600000))).toBeLessThan(5 * 60000);
    expect(screen.getByText('For: alice, bob')).toBeTruthy();
  });

  test('an impossible date is caught before anything is sent', async () => {
    const user = await open('boss', 'admin');
    await goTo(user, 'Meetings');
    await user.press(await screen.findByLabelText('schedule meeting'));
    await user.type(screen.getByPlaceholderText(/Title/), 'X');
    await user.type(screen.getByPlaceholderText('Zoom meeting number'), '81234567890');
    await user.clear(screen.getByPlaceholderText('YYYY-MM-DD'));
    await user.type(screen.getByPlaceholderText('YYYY-MM-DD'), '2026-02-30');
    await user.press(screen.getByText('Save meeting'));
    expect(await screen.findByText(/YYYY-MM-DD/, { exact: false })).toBeTruthy();
    expect(backend.meetings).toHaveLength(0);
  });

  test('an admin can delete a meeting after confirming', async () => {
    backend.seedMeeting({ title: 'Cancel me' });
    (Alert.alert as jest.Mock).mockImplementation((_t, _m, buttons) => buttons?.find((b: { text: string }) => b.text === 'Delete')?.onPress?.());
    const user = await open('boss', 'admin');
    await goTo(user, 'Meetings');
    await user.press(await screen.findByLabelText('delete Cancel me'));
    await waitFor(() => expect(screen.queryByLabelText('meeting Cancel me')).toBeNull());
    expect(backend.meetings).toHaveLength(0);
  });

  test('a member who tries to schedule anyway is refused by the server', async () => {
    const user = await open();
    await expect(portal.createMeeting({ title: 'x', description: '', meetingNumber: '81234567890', passcode: null, startTime: new Date().toISOString(), durationMinutes: 30, assignees: [] })).rejects.toThrow(/Admins only/);
    expect(user).toBeTruthy();
  });
});

describe('profile', () => {
  test('shows who is signed in and the floating-window permission', async () => {
    const user = await open('alice');
    await goTo(user, 'Profile');
    expect(await screen.findByText('@alice')).toBeTruthy();
    expect(screen.getByText('Member')).toBeTruthy();
    expect(screen.getByText('Allowed')).toBeTruthy();
  });

  test('saving the server address tests the connection', async () => {
    const user = await open();
    await goTo(user, 'Profile');
    const input = await screen.findByPlaceholderText('http://192.168.1.20:8000');
    await user.clear(input);
    await user.type(input, '192.168.1.20:8000');
    await user.press(screen.getByText('Save and test connection'));
    expect(await screen.findByText('Connected to http://192.168.1.20:8000')).toBeTruthy();
    expect(await AsyncStorage.getItem('server_url')).toBe('http://192.168.1.20:8000');
  });

  test('an address that does not answer is saved but flagged', async () => {
    const user = await open();
    await goTo(user, 'Profile');
    backend.down = true;
    await user.press(await screen.findByText('Save and test connection'));
    expect(await screen.findByText(/did not answer/)).toBeTruthy();
  });
});
