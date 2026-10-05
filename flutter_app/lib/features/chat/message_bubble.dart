import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../auth/session_controller.dart';
import 'chat_models.dart';
import 'conversation_controller.dart';

class MessageBubble extends ConsumerWidget {
  const MessageBubble({super.key, required this.message, this.showSender = true});

  final ChatMessage message;
  final bool showSender;

  void _showActions(BuildContext context, WidgetRef ref) {
    final controller = ref.read(conversationControllerProvider.notifier);
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (message.isDelivered)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    for (final emoji in quickReactions)
                      InkResponse(
                        radius: 26,
                        onTap: () {
                          Navigator.pop(sheet);
                          controller.toggleReaction(message, emoji);
                        },
                        child: Padding(
                          padding: const EdgeInsets.all(6),
                          child: Text(emoji, style: const TextStyle(fontSize: 28)),
                        ),
                      ),
                  ],
                ),
              ),
            if (message.canReplyTo)
              ListTile(
                leading: const Icon(Icons.reply),
                title: const Text('Reply'),
                onTap: () {
                  Navigator.pop(sheet);
                  controller.startReply(message);
                },
              ),
            if (message.kind == MessageKind.text)
              ListTile(
                leading: const Icon(Icons.copy),
                title: const Text('Copy'),
                onTap: () async {
                  Navigator.pop(sheet);
                  await Clipboard.setData(ClipboardData(text: message.text));
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Copied')));
                  }
                },
              ),
            if (message.canEdit)
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: const Text('Edit'),
                onTap: () {
                  Navigator.pop(sheet);
                  controller.startEdit(message);
                },
              ),
            if (message.isMine)
              ListTile(
                leading: Icon(Icons.delete_outline, color: Theme.of(context).colorScheme.error),
                title: Text('Delete', style: TextStyle(color: Theme.of(context).colorScheme.error)),
                onTap: () async {
                  Navigator.pop(sheet);
                  final ok = await showDialog<bool>(
                    context: context,
                    builder: (d) => AlertDialog(
                      title: const Text('Delete message?'),
                      content: const Text('It will be removed for everyone in this chat.'),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')),
                        FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Delete')),
                      ],
                    ),
                  );
                  if (ok == true) controller.delete(message);
                },
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final mine = message.isMine;
    final bg = mine ? scheme.primary : scheme.surfaceContainerHigh;
    final fg = mine ? scheme.onPrimary : scheme.onSurface;
    final myId = ref.watch(sessionProvider)?.userId;
    final isImage = message.kind == MessageKind.image;

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
              GestureDetector(
                onLongPress: () => _showActions(context, ref),
                behavior: HitTestBehavior.opaque,
                child: DecoratedBox(
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
                    padding: isImage
                        ? const EdgeInsets.fromLTRB(4, 4, 4, 6)
                        : const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (message.replyTo != null)
                          _QuoteBlock(reply: message.replyTo!, color: fg),
                        if (isImage)
                          _ImageContent(message: message)
                        else if (message.kind == MessageKind.file)
                          _FileContent(message: message, color: fg),
                        if (message.text.isNotEmpty)
                          Padding(
                            padding: isImage ? const EdgeInsets.fromLTRB(10, 6, 10, 0) : EdgeInsets.zero,
                            child: Text(message.text, style: TextStyle(color: fg, fontSize: 15.5)),
                          ),
                        const SizedBox(height: 3),
                        Padding(
                          padding: isImage ? const EdgeInsets.only(right: 8) : EdgeInsets.zero,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (message.edited)
                                Text(
                                  'edited  ',
                                  style: TextStyle(color: fg.withValues(alpha: 0.7), fontSize: 10.5),
                                ),
                              Text(
                                DateFormat.jm().format(message.createdAt),
                                style: TextStyle(color: fg.withValues(alpha: 0.7), fontSize: 10.5),
                              ),
                              if (mine) ...[
                                const SizedBox(width: 4),
                                _StatusIcon(message: message, color: fg),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              if (message.reactions.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Wrap(
                    spacing: 4,
                    runSpacing: 4,
                    children: [
                      for (final r in message.reactions)
                        _ReactionChip(
                          reaction: r,
                          mine: r.reactedBy(myId),
                          onTap: () => ref
                              .read(conversationControllerProvider.notifier)
                              .toggleReaction(message, r.key),
                        ),
                    ],
                  ),
                ),
              if (message.status == DeliveryStatus.failed)
                TextButton.icon(
                  style: TextButton.styleFrom(
                    foregroundColor: scheme.error,
                    visualDensity: VisualDensity.compact,
                  ),
                  onPressed: () => ref.read(conversationControllerProvider.notifier).retry(message),
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('Not sent. Tap to retry'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusIcon extends StatelessWidget {
  const _StatusIcon({required this.message, required this.color});

  final ChatMessage message;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final c = color.withValues(alpha: 0.8);
    return switch (message.status) {
      DeliveryStatus.sending => Icon(Icons.schedule, size: 12, color: c),
      DeliveryStatus.sent => Icon(
          message.seen ? Icons.done_all : Icons.done,
          size: 14,
          color: message.seen ? Colors.lightBlueAccent : c,
        ),
      DeliveryStatus.failed =>
        Icon(Icons.error_outline, size: 13, color: Theme.of(context).colorScheme.errorContainer),
    };
  }
}

class _ReactionChip extends StatelessWidget {
  const _ReactionChip({required this.reaction, required this.mine, required this.onTap});

  final ChatReaction reaction;
  final bool mine;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: mine ? scheme.primaryContainer : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: mine ? scheme.primary : Colors.transparent),
        ),
        child: Text('${reaction.key} ${reaction.count}', style: const TextStyle(fontSize: 13)),
      ),
    );
  }
}

class _ImageContent extends StatelessWidget {
  const _ImageContent({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final uploading = message.status == DeliveryStatus.sending;
    final Widget image;
    if (message.attachmentUrl != null) {
      image = Image.network(
        message.attachmentUrl!,
        width: 230,
        fit: BoxFit.cover,
        loadingBuilder: (context, child, progress) => progress == null
            ? child
            : const SizedBox(width: 230, height: 160, child: Center(child: CircularProgressIndicator())),
        errorBuilder: (context, _, _) => const _BrokenImage(),
      );
    } else if (message.localPath != null) {
      image = Image.file(
        File(message.localPath!),
        width: 230,
        fit: BoxFit.cover,
        errorBuilder: (context, _, _) => const _BrokenImage(),
      );
    } else {
      image = const _BrokenImage();
    }
    return GestureDetector(
      onTap: message.attachmentUrl == null
          ? null
          : () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => _ImageViewer(url: message.attachmentUrl!)),
              ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Stack(
          alignment: Alignment.center,
          children: [
            image,
            if (uploading)
              const Positioned.fill(
                child: ColoredBox(
                  color: Color(0x66000000),
                  child: Center(child: CircularProgressIndicator(color: Colors.white)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _BrokenImage extends StatelessWidget {
  const _BrokenImage();

  @override
  Widget build(BuildContext context) => const SizedBox(
        width: 230,
        height: 120,
        child: Center(child: Icon(Icons.broken_image_outlined, size: 40)),
      );
}

class _ImageViewer extends StatelessWidget {
  const _ImageViewer({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(backgroundColor: Colors.black, foregroundColor: Colors.white),
      body: Center(
        child: InteractiveViewer(
          child: Image.network(
            url,
            errorBuilder: (context, _, _) => const Icon(Icons.broken_image_outlined, color: Colors.white, size: 48),
          ),
        ),
      ),
    );
  }
}

class _FileContent extends StatelessWidget {
  const _FileContent({required this.message, required this.color});

  final ChatMessage message;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.insert_drive_file_outlined, color: color),
        const SizedBox(width: 8),
        Flexible(
          child: Text(message.attachmentName ?? 'File', style: TextStyle(color: color), overflow: TextOverflow.ellipsis),
        ),
      ],
    );
  }
}

/// The quoted original inside a reply bubble.
class _QuoteBlock extends StatelessWidget {
  const _QuoteBlock({required this.reply, required this.color});

  final ReplyPreview reply;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border(left: BorderSide(color: color.withValues(alpha: 0.8), width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            reply.senderName,
            style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w700),
          ),
          Text(
            reply.text,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: color.withValues(alpha: 0.85), fontSize: 13),
          ),
        ],
      ),
    );
  }
}
