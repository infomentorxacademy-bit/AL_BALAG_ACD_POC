import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/session_controller.dart';
import 'channel_list_controller.dart';
import 'chat_models.dart';

/// Parses "alice, bob  carol" into unique user ids (commas and spaces both separate).
List<String> parseUserIds(String input, {String? exclude}) {
  final ids = <String>[];
  for (final part in input.split(RegExp(r'[,\s]+'))) {
    final id = part.trim();
    if (id.isNotEmpty && id != exclude && !ids.contains(id)) ids.add(id);
  }
  return ids;
}

/// Bottom sheet to start a direct chat or a group. Returns the created channel, or null.
Future<ChatChannel?> showNewChatSheet(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet<ChatChannel>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => const _NewChatSheet(),
  );
}

class _NewChatSheet extends ConsumerStatefulWidget {
  const _NewChatSheet();

  @override
  ConsumerState<_NewChatSheet> createState() => _NewChatSheetState();
}

class _NewChatSheetState extends ConsumerState<_NewChatSheet> {
  final _ids = TextEditingController();
  final _name = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _ids.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final me = ref.read(sessionProvider)?.userId;
    final ids = parseUserIds(_ids.text, exclude: me);
    if (ids.isEmpty) {
      setState(() => _error = 'Enter at least one user id.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final channel = await ref
          .read(channelListControllerProvider.notifier)
          .createChannel(userIds: ids, name: _name.text);
      if (mounted) Navigator.pop(context, channel);
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Could not start the chat. Check that every user id exists in Sendbird.\n$e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(sessionProvider)?.userId;
    final ids = parseUserIds(_ids.text, exclude: me);
    final isGroup = ids.length > 1;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('New chat', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(
              'Type one user id for a direct chat, or several separated by commas for a group.',
              style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _ids,
              autofocus: true,
              autocorrect: false,
              enableSuggestions: false,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'User id(s)',
                hintText: 'e.g. bob   or   bob, carol',
                prefixIcon: Icon(Icons.person_add_alt_1_outlined),
                border: OutlineInputBorder(),
              ),
            ),
            if (isGroup) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _name,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Group name (optional)',
                  prefixIcon: Icon(Icons.groups_outlined),
                  border: OutlineInputBorder(),
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                onPressed: _busy || ids.isEmpty ? null : _create,
                icon: _busy
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.chat_bubble_outline),
                label: Text(isGroup ? 'Create group' : 'Start chat'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
