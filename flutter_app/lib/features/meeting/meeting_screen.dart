import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/session_controller.dart';
import '../settings/server_settings_dialog.dart';
import '../settings/settings_controller.dart';
import 'meeting_controller.dart';
import 'zoom_errors.dart';

class MeetingScreen extends ConsumerStatefulWidget {
  const MeetingScreen({super.key});

  @override
  ConsumerState<MeetingScreen> createState() => _MeetingScreenState();
}

class _MeetingScreenState extends ConsumerState<MeetingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _number = TextEditingController();
  final _passcode = TextEditingController();
  bool _hidePasscode = true;

  @override
  void dispose() {
    _number.dispose();
    _passcode.dispose();
    super.dispose();
  }

  Future<void> _join() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    final user = ref.read(sessionProvider);
    if (user == null) return;
    await ref.read(meetingControllerProvider.notifier).join(
          meetingNumber: _number.text,
          displayName: user.displayName,
          passcode: _passcode.text,
        );
  }

  @override
  Widget build(BuildContext context) {
    final meeting = ref.watch(meetingControllerProvider);
    final server = ref.watch(apiBaseUrlProvider);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text('Join a Zoom meeting',
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text('The meeting opens inside this app.',
            style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
        const SizedBox(height: 20),
        Form(
          key: _formKey,
          child: Column(
            children: [
              TextFormField(
                controller: _number,
                enabled: !meeting.busy,
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9 \-]')),
                  const _MeetingNumberFormatter(),
                ],
                decoration: const InputDecoration(
                  labelText: 'Meeting number',
                  hintText: '123 4567 8901',
                  prefixIcon: Icon(Icons.tag),
                ),
                validator: validateMeetingNumber,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _passcode,
                enabled: !meeting.busy,
                obscureText: _hidePasscode,
                autocorrect: false,
                enableSuggestions: false,
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) => _join(),
                decoration: InputDecoration(
                  labelText: 'Passcode (if required)',
                  prefixIcon: const Icon(Icons.lock_outline),
                  suffixIcon: IconButton(
                    tooltip: _hidePasscode ? 'Show passcode' : 'Hide passcode',
                    icon: Icon(_hidePasscode ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                    onPressed: () => setState(() => _hidePasscode = !_hidePasscode),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: meeting.busy ? null : _join,
          icon: meeting.busy
              ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.4))
              : const Icon(Icons.videocam_rounded),
          label: Text(switch (meeting.phase) {
            MeetingPhase.preparing => 'Connecting to Zoom…',
            MeetingPhase.joining => 'Joining…',
            _ => 'Join meeting',
          }),
        ),
        if (meeting.phase == MeetingPhase.error && meeting.error != null) ...[
          const SizedBox(height: 16),
          _Banner(
            icon: Icons.error_outline,
            color: scheme.errorContainer,
            onColor: scheme.onErrorContainer,
            text: meeting.error!,
            onClose: ref.read(meetingControllerProvider.notifier).dismissError,
          ),
        ],
        if (meeting.phase == MeetingPhase.inMeeting) ...[
          const SizedBox(height: 16),
          _Banner(
            icon: Icons.videocam,
            color: scheme.primaryContainer,
            onColor: scheme.onPrimaryContainer,
            text: 'You are in a meeting.',
          ),
        ],
        if (meeting.recent.isNotEmpty) ...[
          const SizedBox(height: 28),
          Text('Recent', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final n in meeting.recent)
                ActionChip(
                  avatar: const Icon(Icons.history, size: 18),
                  label: Text(formatMeetingNumber(n)),
                  onPressed: meeting.busy ? null : () => _number.text = formatMeetingNumber(n),
                ),
            ],
          ),
        ],
        const SizedBox(height: 28),
        Card(
          elevation: 0,
          color: scheme.surfaceContainerLow,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.info_outline, size: 18, color: scheme.primary),
                    const SizedBox(width: 8),
                    Text('Good to know', style: theme.textTheme.titleSmall),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  '• Host the meeting from the same Zoom account that owns the SDK app. '
                  'Zoom restricts unpublished apps from joining other accounts\' meetings.\n'
                  '• Zoom tokens come from your backend server (below).',
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text(server,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                    ),
                    TextButton(
                      onPressed: () => showServerSettingsDialog(context),
                      child: const Text('Change'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Formats digits as "123 4567 8901" while typing.
class _MeetingNumberFormatter extends TextInputFormatter {
  const _MeetingNumberFormatter();

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = normalizeMeetingNumber(newValue.text);
    final capped = digits.length > 11 ? digits.substring(0, 11) : digits;
    final text = formatMeetingNumber(capped);
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({
    required this.icon,
    required this.color,
    required this.onColor,
    required this.text,
    this.onClose,
  });

  final IconData icon;
  final Color color;
  final Color onColor;
  final String text;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: onColor),
            const SizedBox(width: 10),
            Expanded(child: Text(text, style: TextStyle(color: onColor))),
            if (onClose != null)
              IconButton(
                visualDensity: VisualDensity.compact,
                icon: Icon(Icons.close, size: 18, color: onColor),
                onPressed: onClose,
              ),
          ],
        ),
      ),
    );
  }
}
