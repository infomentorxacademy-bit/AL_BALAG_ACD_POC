// Shared by the UI tests: controllers wired to an in-memory fake chat service instead of Sendbird.
import { ChannelListController } from '../src/chat/channelListController';
import { ConversationController } from '../src/chat/conversationController';
import type { PickedImage } from '../src/chat/conversationController';
import { ActiveMeetingController } from '../src/meeting/activeMeeting';
import { FakeChatService, FakeZoomWindow } from '../tests/fakes';

export const fake = new FakeChatService();
export const picker: { next: PickedImage | null } = { next: null };
export const channelList = new ChannelListController(fake);
export const zoom = new FakeZoomWindow();
export const activeMeeting = new ActiveMeetingController(zoom);
export const conversation = new ConversationController(fake, channelList, async () => picker.next, 40);

/** Fresh fake service state for each test. */
export function resetFake(): void {
  conversation.close();
  Object.assign(fake, new FakeChatService());
  Object.assign(zoom, new FakeZoomWindow());
  activeMeeting.end();
  picker.next = null;
  joined.length = 0;
  joinResult.value = 'MEETING_ERROR_SUCCESS';
}

/** Meetings the mocked Zoom host was asked to join, and the answer it gives. */
export const joined: string[] = [];
export const joinResult = { value: 'MEETING_ERROR_SUCCESS' };
