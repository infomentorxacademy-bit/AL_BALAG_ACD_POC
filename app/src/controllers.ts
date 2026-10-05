import { ChannelListController } from './chat/channelListController';
import { ConversationController } from './chat/conversationController';
import { SendbirdChatService } from './chat/sendbirdService';
import { config } from './config';
import { pickImageFromGallery } from './imagePicker';

/** App-wide singletons: one chat connection, one chat list, one open conversation. */
export const chatService = new SendbirdChatService(config.sendbirdAppId);
export const channelList = new ChannelListController(chatService);
export const conversation = new ConversationController(chatService, channelList, pickImageFromGallery);

import { ActiveMeetingController } from './meeting/activeMeeting';
import { zoomWindow } from './meeting/zoomWindow';

/** The Zoom meeting that may be running while the user uses the rest of the app. */
export const activeMeeting = new ActiveMeetingController(zoomWindow);
