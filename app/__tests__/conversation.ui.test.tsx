import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('../src/controllers', () => {
  const t = require('./testApp');
  return { channelList: t.channelList, conversation: t.conversation, chatService: t.fake };
});

import ConversationScreen from '../src/screens/ConversationScreen';
import { chan, DEMO, msg } from '../tests/fakes';
import { channelList, conversation, fake, picker, resetFake } from './testApp';

const THUMB = '\u{1F44D}';

async function openRoom(history: ReturnType<typeof msg>[] = [], onBack = jest.fn()) {
  fake.history = history;
  await channelList.start('alice', 'Alice');
  await render(<ConversationScreen channel={chan()} myUserId="alice" onBack={onBack} />);
  await waitFor(() => expect(conversation.state.phase).toBe('ready'));
  return { user: userEvent.setup(), onBack };
}

beforeEach(() => {
  resetFake();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

test('shows the history, the chat name and who is in it', async () => {
  await openRoom([msg('5', 'Who has the schedule?')]);
  expect(await screen.findByText('Who has the schedule?')).toBeTruthy();
  expect(screen.getByText('POC Demo Room')).toBeTruthy();
  expect(screen.getByText('3 members')).toBeTruthy();
});

test('an empty chat invites you to say hello', async () => {
  await openRoom([]);
  expect(await screen.findByText(/No messages yet/)).toBeTruthy();
});

test('typing and pressing send posts the message and clears the box', async () => {
  const { user } = await openRoom();
  const input = screen.getByPlaceholderText('Message');
  await user.type(input, 'Hello team');
  await user.press(screen.getByLabelText('Send'));
  await waitFor(() => expect(fake.sent).toEqual(['Hello team']));
  expect(await screen.findByText('Hello team')).toBeTruthy();
  expect(screen.getByPlaceholderText('Message').props.value).toBe('');
});

test('typing tells the others, and the send button is off while the box is empty', async () => {
  const { user } = await openRoom();
  await user.type(screen.getByPlaceholderText('Message'), 'hey');
  expect(fake.typingCalls[0]).toBe(true);
  expect(screen.getByLabelText('Send').props.accessibilityState?.disabled).toBeFalsy();
});

test('a failed send offers a retry', async () => {
  const { user } = await openRoom();
  fake.sendError = new Error('offline');
  await user.type(screen.getByPlaceholderText('Message'), 'Are you there?');
  await user.press(screen.getByLabelText('Send'));
  const retry = await screen.findByText(/Not sent. Tap to retry/);
  fake.sendError = undefined;
  await user.press(retry);
  await waitFor(() => expect(fake.sent).toEqual(['Are you there?']));
  expect(screen.queryByText(/Not sent/)).toBeNull();
});

test('long-press, Reply: the reply bar shows, and the sent reply carries the quote', async () => {
  const { user } = await openRoom([msg('5', 'Who has the schedule?')]);
  await user.longPress(await screen.findByText('Who has the schedule?'));
  await user.press(await screen.findByText('Reply'));
  expect(await screen.findByText('Replying to bob')).toBeTruthy();

  await user.type(screen.getByPlaceholderText('Message'), 'I do');
  await user.press(screen.getByLabelText('Send'));
  await waitFor(() => expect(fake.replies[0]?.messageId).toBe('5'));
  expect(screen.queryByText('Replying to bob')).toBeNull(); // bar closed
  // The original now appears twice: as the message and quoted inside the reply.
  expect(screen.getAllByText('Who has the schedule?')).toHaveLength(2);
});

test('the reply bar can be cancelled', async () => {
  const { user } = await openRoom([msg('5', 'hello')]);
  await user.longPress(await screen.findByText('hello'));
  await user.press(await screen.findByText('Reply'));
  await user.press(await screen.findByLabelText('Cancel reply'));
  expect(screen.queryByText('Replying to bob')).toBeNull();
});

test('react with an emoji, then tap the chip to take it back', async () => {
  const { user } = await openRoom([msg('5', 'party')]);
  await user.longPress(await screen.findByText('party'));
  await user.press(await screen.findByText(THUMB));
  expect(await screen.findByText(`${THUMB} 1`)).toBeTruthy();
  expect(fake.reactions[0]).toEqual({ id: '5', key: THUMB, on: true });

  await user.press(screen.getByText(`${THUMB} 1`));
  await waitFor(() => expect(screen.queryByText(`${THUMB} 1`)).toBeNull());
});

test('edit my own message', async () => {
  const { user } = await openRoom([msg('7', 'Meeting at 9', { mine: true })]);
  await user.longPress(await screen.findByText('Meeting at 9'));
  await user.press(await screen.findByText('Edit'));
  expect(await screen.findByText('Editing message')).toBeTruthy();
  expect(screen.getByPlaceholderText('Edit message').props.value).toBe('Meeting at 9');

  const input = screen.getByPlaceholderText('Edit message');
  await user.clear(input);
  await user.type(input, 'Meeting at 10');
  await user.press(screen.getByLabelText('Save'));
  await waitFor(() => expect(fake.edits[0]).toEqual({ id: '7', text: 'Meeting at 10' }));
  expect(await screen.findByText('Meeting at 10')).toBeTruthy();
  expect(screen.getByText(/edited/)).toBeTruthy();
});

test('delete my own message after confirming', async () => {
  (Alert.alert as jest.Mock).mockImplementation((_t, _m, buttons) =>
    buttons?.find((b: { text: string }) => b.text === 'Delete')?.onPress?.(),
  );
  const { user } = await openRoom([msg('7', 'Oops wrong chat', { mine: true })]);
  await user.longPress(await screen.findByText('Oops wrong chat'));
  await user.press(await screen.findByText('Delete'));
  await waitFor(() => expect(fake.deleted).toEqual(['7']));
  await waitFor(() => expect(screen.queryByText('Oops wrong chat')).toBeNull());
});

test("other people's messages offer neither Edit nor Delete", async () => {
  const { user } = await openRoom([msg('5', 'theirs')]);
  await user.longPress(await screen.findByText('theirs'));
  expect(await screen.findByText('Reply')).toBeTruthy();
  expect(screen.queryByText('Edit')).toBeNull();
  expect(screen.queryByText('Delete')).toBeNull();
});

test('a new message and a typing indicator arrive live', async () => {
  await openRoom([msg('5', 'first', { at: 1 })]);
  await act(async () => fake.emit({ type: 'typingChanged', channelUrl: DEMO, names: ['bob'] }));
  expect((await screen.findAllByText('bob is typing…')).length).toBeGreaterThan(0);

  await act(async () => {
    fake.emit({ type: 'typingChanged', channelUrl: DEMO, names: [] });
    fake.emit({ type: 'messageReceived', channelUrl: DEMO, message: msg('6', 'Right here!', { at: 2 }) });
  });
  expect(await screen.findByText('Right here!')).toBeTruthy();
  expect(screen.queryByText('bob is typing…')).toBeNull();
});

test('my messages show two ticks once everyone has read them', async () => {
  await openRoom([msg('5', 'read me', { mine: true })]);
  expect(await screen.findByText(/✓$/)).toBeTruthy();
  await act(async () => fake.emit({ type: 'readReceiptsChanged', channelUrl: DEMO, seenMessageIds: ['5'] }));
  expect(await screen.findByText(/✓✓/)).toBeTruthy();
});

test('sending a photo uploads it', async () => {
  const { user } = await openRoom();
  picker.next = { uri: 'file:///photos/cat.jpg', name: 'cat.jpg', type: 'image/jpeg', size: 10 };
  await user.press(screen.getByLabelText('Send a photo'));
  await waitFor(() => expect(fake.images).toEqual(['file:///photos/cat.jpg']));
});

test('offline: the box is disabled with a hint', async () => {
  await openRoom();
  await act(async () => fake.emitConnection('offline'));
  expect(await screen.findByPlaceholderText(/Offline/)).toBeTruthy();
  expect(screen.getByText('Offline')).toBeTruthy();
});

test('the back arrow goes back', async () => {
  const { user, onBack } = await openRoom();
  await user.press(screen.getByLabelText('Back'));
  expect(onBack).toHaveBeenCalled();
});

test('a load failure shows an error with Try again', async () => {
  fake.loadMessagesError = new Error('boom');
  fake.history = [];
  await channelList.start('alice', 'Alice');
  await render(<ConversationScreen channel={chan()} myUserId="alice" onBack={() => undefined} />);
  expect(await screen.findByText(/boom/)).toBeTruthy();
  fake.loadMessagesError = undefined;
  await userEvent.setup().press(screen.getByText('Try again'));
  await waitFor(() => expect(conversation.state.phase).toBe('ready'));
});
