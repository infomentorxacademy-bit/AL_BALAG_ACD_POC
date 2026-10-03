import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'settings_controller.dart';

Future<void> showServerSettingsDialog(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (_) => const _ServerSettingsDialog(),
  );
}

class _ServerSettingsDialog extends ConsumerStatefulWidget {
  const _ServerSettingsDialog();

  @override
  ConsumerState<_ServerSettingsDialog> createState() => _ServerSettingsDialogState();
}

class _ServerSettingsDialogState extends ConsumerState<_ServerSettingsDialog> {
  late final TextEditingController _controller =
      TextEditingController(text: ref.read(apiBaseUrlProvider));
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final ok = await ref.read(apiBaseUrlProvider.notifier).update(_controller.text);
    if (!mounted) return;
    if (ok) {
      Navigator.pop(context);
    } else {
      setState(() => _error = 'Enter a valid http(s) address, e.g. http://192.168.1.20:8000');
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Backend server'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Address of the FastAPI service that signs Zoom tokens. On a physical '
            'phone use your computer\'s LAN IP.',
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            keyboardType: TextInputType.url,
            autocorrect: false,
            decoration: InputDecoration(labelText: 'Server URL', errorText: _error),
            onSubmitted: (_) => _save(),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () async {
            await ref.read(apiBaseUrlProvider.notifier).reset();
            if (context.mounted) Navigator.pop(context);
          },
          child: const Text('Reset'),
        ),
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(88, 44)),
          onPressed: _save,
          child: const Text('Save'),
        ),
      ],
    );
  }
}
