// Shared by the UI tests: controllers wired to an in-memory fake chat service instead of Sendbird.
import { ChannelListController } from '../src/chat/channelListController';
import { ConversationController } from '../src/chat/conversationController';
import type { PickedImage } from '../src/chat/conversationController';
import { FakeChatService } from '../tests/fakes';

export const fake = new FakeChatService();
export const picker: { next: PickedImage | null } = { next: null };
export const channelList = new ChannelListController(fake);
export const conversation = new ConversationController(fake, channelList, async () => picker.next, 40);

/** Fresh fake service state for each test. */
export function resetFake(): void {
  conversation.close();
  Object.assign(fake, new FakeChatService());
  picker.next = null;
}
