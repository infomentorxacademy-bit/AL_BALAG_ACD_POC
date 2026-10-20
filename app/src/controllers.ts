import { ChannelListController } from './chat/channelListController';
import { ConversationController } from './chat/conversationController';
import { SendbirdChatService } from './chat/sendbirdService';
import { config } from './config';
import { pickImageFromGallery } from './imagePicker';
import { PortalController } from './portal/portalController';
import { ApiClient } from './services/api';
import { SessionStore } from './session';

/** App-wide singletons: one chat connection, one chat list, one open conversation. */
export const chatService = new SendbirdChatService(config.sendbirdAppId);
export const channelList = new ChannelListController(chatService);
export const conversation = new ConversationController(chatService, channelList, pickImageFromGallery);

import { ActiveMeetingController } from './meeting/activeMeeting';
import { zoomWindow } from './meeting/zoomWindow';

/** The Zoom meeting that may be running while the user uses the rest of the app. */
export const activeMeeting = new ActiveMeetingController(zoomWindow);

/** Who is signed in and which server they use. */
export const sessionStore = new SessionStore();

/** The backend: accounts, Zoom tokens, announcements, scheduled meetings. */
export const api = new ApiClient({
  baseUrl: () => sessionStore.state.serverUrl,
  token: () => sessionStore.token,
  // A token the server no longer accepts means the person has to sign in again.
  onUnauthorized: () => {
    if (sessionStore.state.session) sessionStore.signOut();
  },
});

/** Announcements and the meeting schedule. */
export const portal = new PortalController(api);
