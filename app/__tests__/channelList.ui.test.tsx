import { render, screen, userEvent } from '@testing-library/react-native';

jest.mock('../src/controllers', () => {
  const t = require('./testApp');
  return { channelList: t.channelList, conversation: t.conversation, chatService: t.fake };
});

import ChannelListScreen from '../src/screens/ChannelListScreen';
import { chan } from '../tests/fakes';
import { channelList, fake } from './testApp';

beforeEach(async () => {
  fake.channels = [
    chan({ url: 'a', title: 'Old chat', lastMessage: 'old news', lastMessageAt: Date.UTC(2026, 0, 1) }),
    chan({ url: 'b', title: 'Busy chat', lastMessage: 'new stuff', lastMessageAt: Date.UTC(2026, 0, 3), unreadCount: 3 }),
  ];
  await channelList.start('alice', 'Alice');
});

test('shows chats newest first, with previews and an unread badge', async () => {
  await render(<ChannelListScreen onOpen={() => undefined} onRetry={() => undefined} />);
  expect(screen.getByText('Busy chat')).toBeTruthy();
  expect(screen.getByText('new stuff')).toBeTruthy();
  expect(screen.getByText('3')).toBeTruthy();
  const titles = screen.getAllByText(/chat$/).map((n) => n.props.children);
  expect(titles).toEqual(['Busy chat', 'Old chat']);
});

test('tapping a chat opens it', async () => {
  const onOpen = jest.fn();
  await render(<ChannelListScreen onOpen={onOpen} onRetry={() => undefined} />);
  const user = userEvent.setup();
  await user.press(screen.getByText('Old chat'));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ url: 'a' }));
});
