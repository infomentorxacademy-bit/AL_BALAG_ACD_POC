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

class _MeetingScreenState extends ConsumerState<MeetingScreen> with WidgetsBindingObserver {
  final _formKey = GlobalKey<FormState>();
  final _number = TextEditingController();
  final _passcode = TextEditingController();
  bool _hidePasscode = true;
  bool _overlayOk = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _checkOverlay();
  }

  Future<void> _checkOverlay() async {
    final ok = await ref.read(meetingControllerProvider.notifier).overlayAllowed();
    if (mounted && ok != _overlayOk) setState(() => _overlayOk = ok);
  }

  /// Coming back from the system Settings screen: the permission may have changed.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _checkOverlay();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _number.dispose();
    _passcode.dispose();
    super.dispose();
  }

  Future<void> _join() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    final user = ref.read(sessionProvider);
    if (user == null) return;
    final controller = ref.read(meetingControllerProvider.notifier);
    if (await controller.shouldAskForOverlay()) {
      if (!mounted) return;
      final allow = await _askForFloatingWindow();
      if (allow) {
        await controller.openOverlaySettings();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('After allowing it, come back and tap Join meeting again.'),
          ));
        }
        return;
      }
    }
    await controller.join(
          meetingNumber: _number.text,
          displayName: user.displayName,
          passcode: _passcode.text,
        );
  }

  Future<bool> _askForFloatingWindow() async {
    final allow = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (d) => AlertDialog(
        title: const Text('Keep the meeting in a small window?'),
        content: const Text(
          'To keep using the app while you are in a meeting, allow "Display over other apps". '
          'Zoom then shows a small floating window you can tap to go back to full screen.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Not now')),
          FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Allow')),
        ],
      ),
    );
    return allow ?? false;
  }

  Widget _inMeetingCard(MeetingState meeting) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final joining = meeting.phase == MeetingPhase.joining;
    final number = meeting.number == null ? '' : formatMeetingNumber(meeting.number!);
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(joining ? 'Joining the meeting\u2026' : 'You are in a meeting',
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text(number, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 20),
        if (joining)
          const Center(child: CircularProgressIndicator())
        else
          FilledButton.icon(
            onPressed: ref.read(meetingControllerProvider.notifier).returnToMeeting,
            icon: const Icon(Icons.open_in_full),
            label: const Text('Return to meeting'),
          ),
        const SizedBox(height: 24),
        Text(
          'Tip: in the meeting, tap the minimize button (top left). The meeting shrinks to a small window and you '
          'can keep using chat. Tap the small window, or "Return" above, to go back to full screen.',
          style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
        ),
        if (!_overlayOk) ...[
          const SizedBox(height: 20),
          _Banner(
            icon: Icons.picture_in_picture_alt_outlined,
            color: scheme.tertiaryContainer,
            onColor: scheme.onTertiaryContainer,
            text: 'The small floating window is off because "Display over other apps" is not allowed.',
            action: TextButton(
              onPressed: ref.read(meetingControllerProvider.notifier).openOverlaySettings,
              child: const Text('Allow floating window'),
            ),
          ),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final meeting = ref.watch(meetingControllerProvider);
    final server = ref.watch(apiBaseUrlProvider);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    if (meeting.inProgress) return _inMeetingCard(meeting);

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
    this.action,
  });

  final IconData icon;
  final Color color;
  final Color onColor;
  final String text;
  final VoidCallback? onClose;
  final Widget? action;

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
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [Text(text, style: TextStyle(color: onColor)), ?action],
              ),
            ),
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
