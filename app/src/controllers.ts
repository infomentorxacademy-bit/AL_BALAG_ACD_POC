import { ChannelListController } from './chat/channelListController';
import { ConversationController } from './chat/conversationController';
import { SendbirdChatService } from './chat/sendbirdService';
import { config } from './config';
import { pickImageFromGallery } from './imagePicker';

/** App-wide singletons: one chat connection, one chat list, one open conversation. */
export const chatService = new SendbirdChatService(config.sendbirdAppId);
export const channelList = new ChannelListController(chatService);
export const conversation = new ConversationController(chatService, channelList, pickImageFromGallery);
