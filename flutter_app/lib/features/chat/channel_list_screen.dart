import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../auth/session_controller.dart';
import 'channel_list_controller.dart';
import 'chat_models.dart';
import 'conversation_screen.dart';
import 'new_chat_sheet.dart';

/// Opens [channel] as a full-screen conversation.
Future<void> openConversation(BuildContext context, ChatChannel channel) {
  return Navigator.of(context).push(
    MaterialPageRoute<void>(builder: (_) => ConversationScreen(channel: channel)),
  );
}

/// Starts the "new chat" flow and opens the resulting conversation.
Future<void> startNewChat(BuildContext context, WidgetRef ref) async {
  final channel = await showNewChatSheet(context, ref);
  if (channel != null && context.mounted) {
    await openConversation(context, channel);
  }
}

/// The "Chats" tab: all my conversations with unread badges.
class ChannelListScreen extends ConsumerWidget {
  const ChannelListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(channelListControllerProvider);

    switch (state.phase) {
      case ChatPhase.idle:
      case ChatPhase.loading:
        return const Center(child: CircularProgressIndicator());
      case ChatPhase.error:
        return _ErrorView(
          message: state.error ?? 'Something went wrong.',
          onRetry: () {
            final user = ref.read(sessionProvider);
            if (user != null) {
              ref
                  .read(channelListControllerProvider.notifier)
                  .start(userId: user.userId, nickname: user.displayName);
            }
          },
        );
      case ChatPhase.ready:
        return Column(
          children: [
            _ConnectionBanner(connection: state.connection),
            Expanded(
              child: RefreshIndicator(
                onRefresh: ref.read(channelListControllerProvider.notifier).refresh,
                child: state.channels.isEmpty
                    ? ListView(
                        // Scrollable so pull-to-refresh works on the empty state too.
                        children: [
                          SizedBox(
                            height: MediaQuery.sizeOf(context).height * 0.5,
                            child: const _EmptyView(),
                          ),
                        ],
                      )
                    : ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(),
                        itemCount: state.channels.length,
                        separatorBuilder: (_, _) => const Divider(height: 1, indent: 76),
                        itemBuilder: (context, i) => _ChannelTile(channel: state.channels[i]),
                      ),
              ),
            ),
          ],
        );
    }
  }
}

class _ChannelTile extends ConsumerWidget {
  const _ChannelTile({required this.channel});

  final ChatChannel channel;

  Future<void> _confirmLeave(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('Leave "${channel.title}"?'),
        content: const Text('It disappears from your list. You can be added again later.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Leave')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(channelListControllerProvider.notifier).leave(channel.url);
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Could not leave: $e')));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final unread = channel.unreadCount;
    final hasUnread = unread > 0;
    return ListTile(
      onTap: () => openConversation(context, channel),
      onLongPress: () => _confirmLeave(context, ref),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: ChannelAvatar(channel: channel),
      title: Text(
        channel.title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(fontWeight: hasUnread ? FontWeight.w700 : FontWeight.w500),
      ),
      subtitle: Text(
        channel.lastMessage ?? 'No messages yet',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontWeight: hasUnread ? FontWeight.w600 : FontWeight.normal,
          color: hasUnread ? theme.colorScheme.onSurface : theme.colorScheme.onSurfaceVariant,
        ),
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (channel.lastMessage != null && channel.lastMessageAt != null)
            Text(
              _formatTime(channel.lastMessageAt!),
              style: theme.textTheme.labelSmall?.copyWith(
                color: hasUnread ? theme.colorScheme.primary : theme.colorScheme.onSurfaceVariant,
              ),
            ),
          if (hasUnread) ...[
            const SizedBox(height: 4),
            Container(
              constraints: const BoxConstraints(minWidth: 20),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                unread > 99 ? '99+' : '$unread',
                textAlign: TextAlign.center,
                style: TextStyle(color: theme.colorScheme.onPrimary, fontSize: 11, fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ],
      ),
    );
  }

  static String _formatTime(DateTime t) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(t.year, t.month, t.day);
    if (day == today) return DateFormat.jm().format(t);
    if (day == today.subtract(const Duration(days: 1))) return 'Yesterday';
    return DateFormat.MMMd().format(t);
  }
}

class _ConnectionBanner extends StatelessWidget {
  const _ConnectionBanner({required this.connection});

  final ChatConnection connection;

  @override
  Widget build(BuildContext context) {
    if (connection == ChatConnection.online) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final (label, color) = switch (connection) {
      ChatConnection.offline => ('Offline. Waiting to reconnect…', scheme.error),
      ChatConnection.reconnecting => ('Reconnecting…', Colors.orange),
      _ => ('Connecting…', scheme.outline),
    };
    return Material(
      color: color.withValues(alpha: 0.15),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: Row(
          children: [
            Icon(Icons.circle, size: 9, color: color),
            const SizedBox(width: 8),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.forum_outlined, size: 56, color: scheme.outline),
            const SizedBox(height: 16),
            Text('No chats yet', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(
              'Tap "New chat" to message someone by their user id.',
              textAlign: TextAlign.center,
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded, size: 48, color: Theme.of(context).colorScheme.error),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 20),
            FilledButton.tonalIcon(
              style: FilledButton.styleFrom(minimumSize: const Size(160, 48)),
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}
