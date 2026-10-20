// Shared by the UI tests: controllers wired to an in-memory fake chat service instead of Sendbird.
import { ChannelListController } from '../src/chat/channelListController';
import { ConversationController } from '../src/chat/conversationController';
import type { PickedImage } from '../src/chat/conversationController';
import { ActiveMeetingController } from '../src/meeting/activeMeeting';
import { PortalController } from '../src/portal/portalController';
import { ApiClient } from '../src/services/api';
import { SessionStore } from '../src/session';
import { FakeBackend } from '../tests/fakeBackend';
import { FakeChatService, FakeZoomWindow } from '../tests/fakes';

export const fake = new FakeChatService();
export const picker: { next: PickedImage | null } = { next: null };
export const channelList = new ChannelListController(fake);
export const zoom = new FakeZoomWindow();
export const activeMeeting = new ActiveMeetingController(zoom);
export const sessionStore = new SessionStore();
// The real client talks to the in-memory backend through the (mocked) global fetch.
export const api = new ApiClient({
  baseUrl: () => sessionStore.state.serverUrl,
  token: () => sessionStore.token,
  onUnauthorized: () => {
    if (sessionStore.state.session) sessionStore.signOut();
  },
});
export const portal = new PortalController(api, 600_000);
export let backend = new FakeBackend();
export const conversation = new ConversationController(fake, channelList, async () => picker.next, 40);

/** Fresh fake service state for each test. */
export function resetFake(): void {
  conversation.close();
  portal.stop();
  backend = new FakeBackend();
  backend.install();
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

/** Back to "nobody signed in, default server" (the session store is a singleton). */
export function resetSession(): void {
  (sessionStore as unknown as { set: (v: unknown) => void }).set({ session: undefined, serverUrl: 'http://10.0.2.2:8000' });
}
