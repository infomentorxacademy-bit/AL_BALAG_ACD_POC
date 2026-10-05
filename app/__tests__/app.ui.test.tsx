import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('../src/controllers', () => {
  const t = require('./testApp');
  return { channelList: t.channelList, conversation: t.conversation, activeMeeting: t.activeMeeting, chatService: t.fake };
});
// The real Zoom host needs the native SDK. This stand-in answers the join request like Zoom would.
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
import { activeMeeting, channelList, fake, joined, joinResult, resetFake, zoom } from './testApp';

beforeEach(async () => {
  resetFake();
  await channelList.stop();
  await AsyncStorage.clear();
  fake.channels = [chan({ lastMessage: 'bob: Welcome to the room' })];
  fake.history = [msg('1', 'Welcome to the room')];
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  (global as { fetch?: unknown }).fetch = jest.fn();
});

async function signedInApp(userId = 'alice', displayName = 'Alice A') {
  await AsyncStorage.setItem('user_id', userId);
  await AsyncStorage.setItem('display_name', displayName);
  await render(<App />);
  await screen.findByText('POC Demo Room');
  return userEvent.setup();
}

test('login: validates the user id, then shows the chat list', async () => {
  await render(<App />);
  const user = userEvent.setup();
  await user.press(await screen.findByText('Continue'));
  expect(await screen.findByText('Enter a user id')).toBeTruthy();

  await user.type(screen.getByPlaceholderText(/User id/), 'ali ce');
  await user.press(screen.getByText('Continue'));
  expect(await screen.findByText('No spaces allowed')).toBeTruthy();

  await user.clear(screen.getByPlaceholderText(/User id/));
  await user.type(screen.getByPlaceholderText(/User id/), 'alice');
  await user.press(screen.getByText('Continue'));
  expect(await screen.findByText('POC Demo Room')).toBeTruthy();
  expect(await AsyncStorage.getItem('user_id')).toBe('alice');
});

test('an already signed-in user goes straight to the app', async () => {
  await signedInApp();
  expect(screen.queryByText('Continue')).toBeNull();
  expect(screen.getAllByText('Chats')).toHaveLength(2); // header + tab
  expect(screen.getByText('Meeting')).toBeTruthy();
});

test('opening a chat and going back works', async () => {
  const user = await signedInApp();
  await user.press(screen.getByText('POC Demo Room'));
  expect(await screen.findByText('Welcome to the room')).toBeTruthy();
  await user.press(screen.getByLabelText('Back'));
  expect(await screen.findByText('bob: Welcome to the room')).toBeTruthy();
});

test('New chat: start a direct chat by user id', async () => {
  const user = await signedInApp();
  await user.press(screen.getByText(/New chat/));
  await user.type(await screen.findByPlaceholderText(/e\.g\. bob/), 'bob');
  await user.press(screen.getByText('Start chat'));
  await waitFor(() => expect(fake.created[0]?.ids).toEqual(['bob']));
  expect(await screen.findByText(/No messages yet/)).toBeTruthy(); // inside the new conversation
});

test('New chat: several ids make a group, and your own id is dropped', async () => {
  const user = await signedInApp();
  await user.press(screen.getByText(/New chat/));
  await user.type(await screen.findByPlaceholderText(/e\.g\. bob/), 'bob, carol alice');
  expect(await screen.findByText('Group name (optional)')).toBeTruthy();
  await user.type(screen.getByPlaceholderText('Project X'), 'Project X');
  await user.press(screen.getByText('Create group'));
  await waitFor(() => expect(fake.created[0]).toEqual({ ids: ['bob', 'carol'], name: 'Project X' }));
});

test('New chat: a failure is explained and the form stays open', async () => {
  const user = await signedInApp();
  fake.createError = new Error('user not found');
  await user.press(screen.getByText(/New chat/));
  await user.type(await screen.findByPlaceholderText(/e\.g\. bob/), 'nobody');
  await user.press(screen.getByText('Start chat'));
  expect(await screen.findByText(/Could not start the chat/)).toBeTruthy();
  expect(screen.getByText('Start chat')).toBeTruthy();
});

test('sign out disconnects chat and returns to login', async () => {
  (Alert.alert as jest.Mock).mockImplementation((_t, _m, buttons) =>
    buttons?.find((b: { text: string }) => b.text === 'Sign out')?.onPress?.(),
  );
  const user = await signedInApp();
  await user.press(screen.getByLabelText('Account'));
  expect(await screen.findByText('Continue')).toBeTruthy();
  expect(fake.disconnected).toBe(true);
  expect(await AsyncStorage.getItem('user_id')).toBeNull();
});

describe('meeting tab', () => {
  async function toMeeting() {
    const user = await signedInApp();
    await user.press(screen.getByText('Meeting'));
    await screen.findByText('Join a Zoom meeting');
    return user;
  }
  const token = () => (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ signature: 'JWT' }) });

  test('validates the meeting number', async () => {
    const user = await toMeeting();
    await user.press(screen.getByText('Join meeting'));
    expect(await screen.findByText('Enter the meeting number')).toBeTruthy();
    await user.type(screen.getByPlaceholderText('123 4567 8901'), '123');
    await user.press(screen.getByText('Join meeting'));
    expect(await screen.findByText('A meeting number has 9 to 11 digits')).toBeTruthy();
  });

  test('fetches a token from the chosen server, joins as the signed-in name, and remembers the meeting', async () => {
    token();
    const user = await toMeeting();
    const server = screen.getByPlaceholderText('http://192.168.1.20:8000');
    await user.clear(server);
    await user.type(server, '192.168.1.20:8000/');
    await user.type(screen.getByPlaceholderText('123 4567 8901'), '81234567890');
    await user.press(screen.getByText('Join meeting'));

    await waitFor(() => expect(joined).toEqual(['81234567890']));
    expect(activeMeeting.state.session?.userName).toBe('Alice A');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://192.168.1.20:8000/zoom/signature');
    expect(JSON.parse(init.body).meeting_number).toBe('81234567890');
    expect(await AsyncStorage.getItem('server_url')).toBe('http://192.168.1.20:8000');
    expect(JSON.parse((await AsyncStorage.getItem('recent_meetings')) ?? '[]')).toEqual(['81234567890']);
  });

  test('an unreachable server gets actionable advice', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    const user = await toMeeting();
    await user.type(screen.getByPlaceholderText('123 4567 8901'), '81234567890');
    await user.press(screen.getByText('Join meeting'));
    expect(await screen.findByText(/Cannot reach the server at/)).toBeTruthy();
    expect(screen.getByText(/same Wi-Fi/)).toBeTruthy();
    expect(joined).toEqual([]);
  });

  test('a misconfigured server (500) explains the likely cause', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500, text: async () => 'ZOOM_SDK_KEY not configured' });
    const user = await toMeeting();
    await user.type(screen.getByPlaceholderText('123 4567 8901'), '81234567890');
    await user.press(screen.getByText('Join meeting'));
    expect(await screen.findByText(/misconfigured/)).toBeTruthy();
  });

  test('recent meetings can be re-joined in one tap', async () => {
    await AsyncStorage.setItem('recent_meetings', JSON.stringify(['81234567890']));
    token();
    const user = await toMeeting();
    await user.press(await screen.findByText('812 3456 7890'));
    await waitFor(() => expect(joined).toEqual(['81234567890']));
  });

  test('Zoom refusing the join shows why and returns to the form', async () => {
    token();
    joinResult.value = 'MEETING_ERROR_INCORRECT_MEETING_NUMBER';
    const user = await toMeeting();
    await user.type(screen.getByPlaceholderText('123 4567 8901'), '81234567890');
    await user.press(screen.getByText('Join meeting'));
    expect(await screen.findByText(/MEETING_ERROR_INCORRECT_MEETING_NUMBER/)).toBeTruthy();
    expect(screen.getByText('Join meeting')).toBeTruthy(); // form is back
  });
});

describe('a meeting that keeps running while you use the app', () => {
  const token = () => (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ signature: 'JWT' }) });

  async function joinAndGetIn() {
    token();
    const user = await signedInApp();
    await user.press(screen.getByText('Meeting'));
    await user.type(await screen.findByPlaceholderText('123 4567 8901'), '81234567890');
    await user.press(screen.getByText('Join meeting'));
    await waitFor(() => expect(joined).toEqual(['81234567890']));
    await act(async () => zoom.emitState('InMeeting'));
    return user;
  }

  test('the Meeting tab becomes a "you are in a meeting" card with a Return button', async () => {
    const user = await joinAndGetIn();
    expect(await screen.findByText('You are in a meeting')).toBeTruthy();
    expect(screen.getAllByText('812 3456 7890').length).toBeGreaterThan(0);
    await user.press(screen.getByText('Return to meeting'));
    expect(zoom.returned).toBe(1);
    expect(screen.getByText(/minimize button/)).toBeTruthy();
  });

  test('on the Chats tab a green bar offers Return, and chat still works', async () => {
    const user = await joinAndGetIn();
    await user.press(screen.getByText('Chats'));
    expect(await screen.findByLabelText('meeting bar')).toBeTruthy();
    expect(screen.getByText(/In a meeting/)).toBeTruthy();

    await user.press(screen.getByText('Return'));
    expect(zoom.returned).toBe(1);

    // Chat is fully usable meanwhile.
    await user.press(screen.getByText('POC Demo Room'));
    expect(await screen.findByText('Welcome to the room')).toBeTruthy();
    expect(screen.getByLabelText('meeting bar')).toBeTruthy(); // the bar follows you into the chat
  });

  test('the Zoom host joins exactly once, even though the app re-renders around it', async () => {
    const user = await joinAndGetIn();
    await user.press(screen.getByText('Chats'));
    await act(async () => fake.emit({ type: 'channelChanged', channelUrl: 'x', channel: chan({ url: 'x', title: 'X' }) }));
    await user.press(screen.getByText('Meeting'));
    expect(joined).toEqual(['81234567890']);
  });

  test('when the meeting ends the bar disappears and the join form comes back', async () => {
    const user = await joinAndGetIn();
    await user.press(screen.getByText('Chats'));
    await act(async () => zoom.emitState('Ended'));
    await waitFor(() => expect(screen.queryByLabelText('meeting bar')).toBeNull());
    await user.press(screen.getByText('Meeting'));
    expect(await screen.findByText('Join a Zoom meeting')).toBeTruthy();
  });

  test('without the floating-window permission it asks once, and can send you to Settings', async () => {
    zoom.overlay = false;
    token();
    (Alert.alert as jest.Mock).mockImplementation((_t, _m, buttons) =>
      buttons?.find((b: { text: string }) => b.text === 'Allow')?.onPress?.(),
    );
    const user = await signedInApp();
    await user.press(screen.getByText('Meeting'));
    await user.type(await screen.findByPlaceholderText('123 4567 8901'), '81234567890');
    await user.press(screen.getByText('Join meeting'));
    await waitFor(() => expect(zoom.overlaySettingsOpened).toBe(1));
    expect(await screen.findByText(/tap Join meeting again/)).toBeTruthy();
    expect(joined).toEqual([]); // did not join yet: the user must allow it first
  });

  test('declining the permission still lets the meeting start', async () => {
    zoom.overlay = false;
    token();
    (Alert.alert as jest.Mock).mockImplementation((_t, _m, buttons) =>
      buttons?.find((b: { text: string }) => b.text === 'Not now')?.onPress?.(),
    );
    const user = await signedInApp();
    await user.press(screen.getByText('Meeting'));
    await user.type(await screen.findByPlaceholderText('123 4567 8901'), '81234567890');
    await user.press(screen.getByText('Join meeting'));
    await waitFor(() => expect(joined).toEqual(['81234567890']));
  });

  test('signing out ends the meeting state', async () => {
    (Alert.alert as jest.Mock).mockImplementation((_t, _m, buttons) =>
      buttons?.find((b: { text: string }) => b.text === 'Sign out')?.onPress?.(),
    );
    const user = await joinAndGetIn();
    await user.press(screen.getByLabelText('Account'));
    expect(await screen.findByText('Continue')).toBeTruthy();
    expect(activeMeeting.state.phase).toBe('idle');
  });
});
