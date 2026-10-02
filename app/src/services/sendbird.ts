import SendbirdChat, { SendbirdChatWith } from '@sendbird/chat';
import {
  GroupChannel,
  GroupChannelHandler,
  GroupChannelModule,
} from '@sendbird/chat/groupChannel';
import type { BaseMessage } from '@sendbird/chat/message';

import { config } from '../config';

type SendbirdInstance = SendbirdChatWith<[GroupChannelModule]>;

let sb: SendbirdInstance | null = null;

/** Connects a user. For the POC we use user-id-only auth (no session token). */
export async function connect(userId: string): Promise<void> {
  if (!config.sendbirdAppId) {
    throw new Error('EXPO_PUBLIC_SENDBIRD_APP_ID is not set (see app/.env.example).');
  }
  if (!sb) {
    sb = SendbirdChat.init({
      appId: config.sendbirdAppId,
      modules: [new GroupChannelModule()],
    }) as SendbirdInstance;
  }
  await sb.connect(userId);
}

export async function disconnect(): Promise<void> {
  await sb?.disconnect();
}

function requireSb(): SendbirdInstance {
  if (!sb) throw new Error('Sendbird is not connected.');
  return sb;
}

/** Gets (or creates) the shared public demo room and joins it. */
export async function joinDemoRoom(): Promise<GroupChannel> {
  const client = requireSb();
  let channel: GroupChannel;
  try {
    channel = await client.groupChannel.getChannel(config.demoChannelUrl);
  } catch {
    channel = await client.groupChannel.createChannel({
      channelUrl: config.demoChannelUrl,
      name: 'POC Demo Room',
      isPublic: true,
    });
  }
  if (!channel.isPublic || channel.myMemberState !== 'joined') {
    await channel.join();
  }
  return channel;
}

export async function loadHistory(channel: GroupChannel): Promise<BaseMessage[]> {
  return channel.getMessagesByTimestamp(Date.now(), {
    prevResultSize: 50,
    nextResultSize: 0,
    isInclusive: true,
    reverse: false,
  });
}

export function sendText(channel: GroupChannel, text: string): Promise<BaseMessage> {
  return new Promise((resolve, reject) => {
    channel
      .sendUserMessage({ message: text })
      .onSucceeded(resolve)
      .onFailed(reject);
  });
}

/** Subscribes to incoming messages for a channel; returns an unsubscribe fn. */
export function onMessage(channelUrl: string, cb: (m: BaseMessage) => void): () => void {
  const client = requireSb();
  const key = `poc-handler-${channelUrl}`;
  client.groupChannel.addGroupChannelHandler(
    key,
    new GroupChannelHandler({
      onMessageReceived: (channel, message) => {
        if (channel.url === channelUrl) cb(message);
      },
    }),
  );
  return () => client.groupChannel.removeGroupChannelHandler(key);
}
