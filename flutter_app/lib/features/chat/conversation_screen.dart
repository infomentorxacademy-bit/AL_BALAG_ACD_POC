import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'channel_list_controller.dart';
import 'chat_models.dart';
import 'conversation_controller.dart';
import 'message_bubble.dart';

/// One open conversation: messages, typing indicator, composer.
class ConversationScreen extends ConsumerStatefulWidget {
  const ConversationScreen({super.key, required this.channel});

  final ChatChannel channel;

  @override
  ConsumerState<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends ConsumerState<ConversationScreen> {
  final _input = TextEditingController();
  final _focus = FocusNode();
  final _scroll = ScrollController();
  late final ConversationController _controller;

  @override
  void initState() {
    super.initState();
    // Captured now: `ref` must not be used once the widget is disposed.
    _controller = ref.read(conversationControllerProvider.notifier);
    _scroll.addListener(_maybeLoadOlder);
    WidgetsBinding.instance.addPostFrameCallback((_) => _controller.open(widget.channel));
  }

  @override
  void dispose() {
    _scroll.dispose();
    _input.dispose();
    _focus.dispose();
    // Closing changes provider state, which is not allowed while the tree is being torn down.
    Future.microtask(_controller.close);
    super.dispose();
  }

  void _maybeLoadOlder() {
    if (!_scroll.hasClients) return;
    // The list is reversed, so the "end" of the scroll extent is the oldest message.
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 240) {
      _controller.loadOlder();
    }
  }

  void _send() {
    final text = _input.text;
    if (text.trim().isEmpty) return;
    _input.clear();
    _controller.send(text);
  }

  Future<void> _leave() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Leave this chat?'),
        content: const Text('It disappears from your list. You can be added again later.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Leave')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(channelListControllerProvider.notifier).leave(widget.channel.url);
      navigator.pop();
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Could not leave: $e')));
    }
  }

  void _showMembers(ChatChannel channel) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(
                '${channel.memberCount} member${channel.memberCount == 1 ? '' : 's'}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            for (final m in channel.members)
              ListTile(
                leading: CircleAvatar(child: Text(m.displayName.characters.first.toUpperCase())),
                title: Text(m.displayName),
                subtitle: m.nickname.isNotEmpty ? Text(m.userId) : null,
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final chat = ref.watch(conversationControllerProvider);
    final channel = chat.channel ?? widget.channel;
    final connection = ref.watch(channelListControllerProvider.select((s) => s.connection));
    final scheme = Theme.of(context).colorScheme;

    // Jump to the text field when the user picks Reply, and fill it when they pick Edit.
    ref.listen(conversationControllerProvider.select((s) => s.replyingTo), (previous, next) {
      if (next != null) _focus.requestFocus();
    });
    ref.listen(conversationControllerProvider.select((s) => s.editing), (previous, next) {
      if (next != null) {
        _input.text = next.text;
        _input.selection = TextSelection.collapsed(offset: next.text.length);
        _focus.requestFocus();
      } else if (previous != null) {
        _input.clear();
      }
    });
    ref.listen(conversationControllerProvider.select((s) => s.notice), (previous, next) {
      if (next != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(next)));
        _controller.clearNotice();
      }
    });

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: InkWell(
          onTap: () => _showMembers(channel),
          child: Row(
            children: [
              ChannelAvatar(channel: channel, radius: 18),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(channel.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                    Text(
                      _subtitle(channel, chat.typingNames, connection),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: chat.typingNames.isNotEmpty ? scheme.primary : scheme.onSurfaceVariant,
                          ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'More',
            onSelected: (v) {
              if (v == 'members') _showMembers(channel);
              if (v == 'leave') _leave();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'members', child: Text('Members')),
              PopupMenuItem(value: 'leave', child: Text('Leave chat')),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(child: _body(chat)),
          if (chat.phase == ChatPhase.ready) ...[
            if (chat.editing != null)
              _InfoBar(
                icon: Icons.edit_outlined,
                title: 'Editing message',
                text: chat.editing!.text,
                closeTooltip: 'Cancel edit',
                onClose: _controller.cancelEdit,
              ),
            if (chat.replyingTo != null)
              _InfoBar(
                icon: Icons.reply,
                title: 'Replying to ${chat.replyingTo!.isMine ? 'yourself' : chat.replyingTo!.senderName}',
                text: chat.replyingTo!.previewText,
                closeTooltip: 'Cancel reply',
                onClose: _controller.cancelReply,
              ),
            _Composer(
              controller: _input,
              focusNode: _focus,
              onSend: _send,
              onChanged: _controller.onTextChanged,
              onAttach: chat.editing == null ? _controller.sendImage : null,
              enabled: connection != ChatConnection.offline,
              editing: chat.editing != null,
            ),
          ],
        ],
      ),
    );
  }

  static String _subtitle(ChatChannel channel, List<String> typing, ChatConnection connection) {
    if (typing.isNotEmpty) {
      return typing.length == 1 ? '${typing.first} is typing…' : '${typing.join(', ')} are typing…';
    }
    return switch (connection) {
      ChatConnection.connecting => 'Connecting…',
      ChatConnection.reconnecting => 'Reconnecting…',
      ChatConnection.offline => 'Offline',
      ChatConnection.online => channel.isDirect
          ? 'Direct chat'
          : '${channel.memberCount} member${channel.memberCount == 1 ? '' : 's'}',
    };
  }

  Widget _body(ConversationState chat) {
    switch (chat.phase) {
      case ChatPhase.idle:
      case ChatPhase.loading:
        return const Center(child: CircularProgressIndicator());
      case ChatPhase.error:
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.cloud_off_rounded, size: 48, color: Theme.of(context).colorScheme.error),
                const SizedBox(height: 16),
                Text(chat.error ?? 'Something went wrong.', textAlign: TextAlign.center),
                const SizedBox(height: 20),
                FilledButton.tonalIcon(
                  onPressed: () => _controller.open(widget.channel),
                  icon: const Icon(Icons.refresh),
                  label: const Text('Try again'),
                ),
              ],
            ),
          ),
        );
      case ChatPhase.ready:
        if (chat.messages.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                'No messages yet.\nSay hello \u{1F44B}',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
            ),
          );
        }
        return _MessageList(
          messages: chat.messages,
          controller: _scroll,
          loadingMore: chat.loadingMore,
          typing: chat.typingNames,
        );
    }
  }
}

/// Round avatar: a group icon, or the first letter of the name on a colour derived from it.
class ChannelAvatar extends StatelessWidget {
  const ChannelAvatar({super.key, required this.channel, this.radius = 24});

  final ChatChannel channel;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final color = Colors.primaries[channel.title.hashCode.abs() % Colors.primaries.length].shade600;
    return CircleAvatar(
      radius: radius,
      backgroundColor: color,
      foregroundColor: Colors.white,
      child: channel.isDirect || channel.title.isEmpty
          ? Text(channel.title.isEmpty ? '?' : channel.title.characters.first.toUpperCase())
          : Icon(Icons.groups_rounded, size: radius * 1.1),
    );
  }
}

class _MessageList extends StatelessWidget {
  const _MessageList({
    required this.messages,
    required this.controller,
    required this.loadingMore,
    required this.typing,
  });

  final List<ChatMessage> messages;
  final ScrollController controller;
  final bool loadingMore;
  final List<String> typing;

  @override
  Widget build(BuildContext context) {
    // Newest at the bottom: reverse the list view and feed it newest-first.
    final newestFirst = messages.reversed.toList();
    final hasTyping = typing.isNotEmpty;
    return ListView.builder(
      controller: controller,
      reverse: true,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      itemCount: newestFirst.length + (loadingMore ? 1 : 0) + (hasTyping ? 1 : 0),
      itemBuilder: (context, i) {
        // Index 0 is the very bottom: the typing indicator when someone is typing.
        if (hasTyping) {
          if (i == 0) return _TypingBubble(names: typing);
          i -= 1;
        }
        if (i >= newestFirst.length) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))),
          );
        }
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
            MessageBubble(
              key: ValueKey(message.id),
              message: message,
              showSender: !groupedWithOlder,
            ),
          ],
        );
      },
    );
  }

  static bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble({required this.names});

  final List<String> names;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(top: 6, bottom: 2),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHigh,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Text(
            names.length == 1 ? '${names.first} is typing…' : 'Several people are typing…',
            style: TextStyle(color: scheme.onSurfaceVariant, fontStyle: FontStyle.italic),
          ),
        ),
      ),
    );
  }
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

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.focusNode,
    required this.onSend,
    required this.onChanged,
    required this.onAttach,
    required this.enabled,
    required this.editing,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onSend;
  final ValueChanged<String> onChanged;
  final VoidCallback? onAttach;
  final bool enabled;
  final bool editing;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(4, 6, 12, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            IconButton(
              tooltip: 'Send a photo',
              onPressed: enabled ? onAttach : null,
              icon: const Icon(Icons.add_photo_alternate_outlined),
            ),
            Expanded(
              child: TextField(
                controller: controller,
                focusNode: focusNode,
                onChanged: onChanged,
                minLines: 1,
                maxLines: 5,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(
                  hintText: enabled ? (editing ? 'Edit message' : 'Message') : 'Offline. Waiting to reconnect…',
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
                tooltip: editing ? 'Save' : 'Send',
                onPressed: enabled && value.text.trim().isNotEmpty ? onSend : null,
                style: IconButton.styleFrom(
                  backgroundColor: scheme.primary,
                  foregroundColor: scheme.onPrimary,
                  minimumSize: const Size(48, 48),
                ),
                icon: Icon(editing ? Icons.check_rounded : Icons.send_rounded),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Shown above the composer while replying to or editing a message.
class _InfoBar extends StatelessWidget {
  const _InfoBar({
    required this.icon,
    required this.title,
    required this.text,
    required this.closeTooltip,
    required this.onClose,
  });

  final IconData icon;
  final String title;
  final String text;
  final String closeTooltip;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 4, 8),
        child: Row(
          children: [
            Container(width: 3, height: 36, color: scheme.primary),
            const SizedBox(width: 10),
            Icon(icon, size: 18, color: scheme.primary),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(color: scheme.primary, fontWeight: FontWeight.w600, fontSize: 12.5)),
                  Text(text, maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            IconButton(tooltip: closeTooltip, icon: const Icon(Icons.close), onPressed: onClose),
          ],
        ),
      ),
    );
  }
}
