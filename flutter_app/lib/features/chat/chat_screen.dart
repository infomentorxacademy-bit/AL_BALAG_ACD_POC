import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/config.dart';
import '../auth/session_controller.dart';
import 'chat_controller.dart';
import 'chat_models.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _input = TextEditingController();

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  void _send() {
    final text = _input.text;
    if (text.trim().isEmpty) return;
    _input.clear();
    ref.read(chatControllerProvider.notifier).send(text);
  }

  @override
  Widget build(BuildContext context) {
    final chat = ref.watch(chatControllerProvider);
    final theme = Theme.of(context);

    return Column(
      children: [
        _RoomHeader(connection: chat.connection, phase: chat.phase),
        Expanded(child: _body(chat, theme)),
        if (chat.phase == ChatPhase.ready)
          _Composer(controller: _input, onSend: _send, enabled: chat.connection != ChatConnection.offline),
      ],
    );
  }

  Widget _body(ChatState chat, ThemeData theme) {
    switch (chat.phase) {
      case ChatPhase.idle:
      case ChatPhase.loading:
        return const Center(child: CircularProgressIndicator());
      case ChatPhase.error:
        return _ErrorView(
          message: chat.error ?? 'Something went wrong.',
          onRetry: () {
            final user = ref.read(sessionProvider);
            if (user != null) {
              ref
                  .read(chatControllerProvider.notifier)
                  .start(userId: user.userId, nickname: user.displayName);
            }
          },
        );
      case ChatPhase.ready:
        if (chat.messages.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                'No messages yet.\nSay hello \u{1F44B}',
                textAlign: TextAlign.center,
                style: theme.textTheme.titleMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          );
        }
        return _MessageList(messages: chat.messages);
    }
  }
}

class _RoomHeader extends StatelessWidget {
  const _RoomHeader({required this.connection, required this.phase});

  final ChatConnection connection;
  final ChatPhase phase;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (label, color) = switch (connection) {
      ChatConnection.online => ('Online', Colors.green),
      ChatConnection.connecting => ('Connecting…', scheme.outline),
      ChatConnection.reconnecting => ('Reconnecting…', Colors.orange),
      ChatConnection.offline => ('Offline', scheme.error),
    };
    return Material(
      color: scheme.surfaceContainerLow,
      child: ListTile(
        dense: true,
        leading: CircleAvatar(
          backgroundColor: scheme.primaryContainer,
          child: Icon(Icons.forum_rounded, color: scheme.onPrimaryContainer),
        ),
        title: const Text(AppConfig.demoChannelName),
        subtitle: Row(
          children: [
            Icon(Icons.circle, size: 9, color: color),
            const SizedBox(width: 6),
            Text(label),
          ],
        ),
      ),
    );
  }
}

class _MessageList extends StatelessWidget {
  const _MessageList({required this.messages});

  final List<ChatMessage> messages;

  @override
  Widget build(BuildContext context) {
    // Newest at the bottom: reverse the list view and feed it newest-first.
    final newestFirst = messages.reversed.toList();
    return ListView.builder(
      reverse: true,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      itemCount: newestFirst.length,
      itemBuilder: (context, i) {
        final message = newestFirst[i];
        // In a reversed list the "previous" (older) message is at i + 1.
        final older = i + 1 < newestFirst.length ? newestFirst[i + 1] : null;
        final showDate = older == null || !_sameDay(older.createdAt, message.createdAt);
        final groupedWithOlder = older != null &&
            !showDate &&
            older.senderId == message.senderId &&
            message.createdAt.difference(older.createdAt).inMinutes < 5;
        return Column(
          children: [
            if (showDate) _DateChip(date: message.createdAt),
            MessageBubble(message: message, showSender: !groupedWithOlder),
          ],
        );
      },
    );
  }

  static bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _DateChip extends StatelessWidget {
  const _DateChip({required this.date});

  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(date.year, date.month, date.day);
    final label = day == today
        ? 'Today'
        : day == today.subtract(const Duration(days: 1))
            ? 'Yesterday'
            : DateFormat.yMMMd().format(date);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Chip(
        label: Text(label, style: Theme.of(context).textTheme.labelSmall),
        visualDensity: VisualDensity.compact,
        side: BorderSide.none,
      ),
    );
  }
}

class MessageBubble extends StatelessWidget {
  const MessageBubble({super.key, required this.message, this.showSender = true});

  final ChatMessage message;
  final bool showSender;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final mine = message.isMine;
    final bg = mine ? scheme.primary : scheme.surfaceContainerHigh;
    final fg = mine ? scheme.onPrimary : scheme.onSurface;

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
        child: Padding(
          padding: EdgeInsets.only(top: showSender ? 8 : 2),
          child: Column(
            crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            children: [
              if (!mine && showSender)
                Padding(
                  padding: const EdgeInsets.only(left: 12, bottom: 2),
                  child: Text(
                    message.senderName,
                    style: theme.textTheme.labelSmall?.copyWith(color: scheme.primary),
                  ),
                ),
              DecoratedBox(
                decoration: BoxDecoration(
                  color: bg,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(18),
                    topRight: const Radius.circular(18),
                    bottomLeft: Radius.circular(mine ? 18 : 4),
                    bottomRight: Radius.circular(mine ? 4 : 18),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SelectableText(message.text, style: TextStyle(color: fg, fontSize: 15.5)),
                      const SizedBox(height: 3),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            DateFormat.jm().format(message.createdAt),
                            style: TextStyle(color: fg.withValues(alpha: 0.7), fontSize: 10.5),
                          ),
                          if (mine) ...[
                            const SizedBox(width: 4),
                            _StatusIcon(status: message.status, color: fg),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              if (message.status == DeliveryStatus.failed)
                Consumer(
                  builder: (context, ref, _) => TextButton.icon(
                    style: TextButton.styleFrom(
                      foregroundColor: scheme.error,
                      visualDensity: VisualDensity.compact,
                    ),
                    onPressed: () => ref.read(chatControllerProvider.notifier).retry(message),
                    icon: const Icon(Icons.refresh, size: 16),
                    label: const Text('Not sent. Tap to retry'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusIcon extends StatelessWidget {
  const _StatusIcon({required this.status, required this.color});

  final DeliveryStatus status;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final c = color.withValues(alpha: 0.8);
    return switch (status) {
      DeliveryStatus.sending => Icon(Icons.schedule, size: 12, color: c),
      DeliveryStatus.sent => Icon(Icons.done, size: 13, color: c),
      DeliveryStatus.failed => Icon(Icons.error_outline, size: 13, color: Theme.of(context).colorScheme.errorContainer),
    };
  }
}

class _Composer extends StatelessWidget {
  const _Composer({required this.controller, required this.onSend, required this.enabled});

  final TextEditingController controller;
  final VoidCallback onSend;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 5,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  hintText: enabled ? 'Message' : 'Offline. Waiting to reconnect…',
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                ),
                enabled: enabled,
              ),
            ),
            const SizedBox(width: 8),
            ValueListenableBuilder<TextEditingValue>(
              valueListenable: controller,
              builder: (context, value, _) => IconButton.filled(
                tooltip: 'Send',
                onPressed: enabled && value.text.trim().isNotEmpty ? onSend : null,
                style: IconButton.styleFrom(
                  backgroundColor: scheme.primary,
                  foregroundColor: scheme.onPrimary,
                  minimumSize: const Size(48, 48),
                ),
                icon: const Icon(Icons.send_rounded),
              ),
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
