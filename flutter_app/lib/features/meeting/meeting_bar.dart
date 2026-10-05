import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'meeting_controller.dart';
import 'zoom_errors.dart';

/// Shown on every screen while a Zoom meeting is running: tap Return to bring it back to full screen.
class MeetingBar extends ConsumerWidget {
  const MeetingBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final meeting = ref.watch(meetingControllerProvider);
    if (!meeting.inProgress) return const SizedBox.shrink();
    final joining = meeting.phase == MeetingPhase.joining;
    final number = meeting.number == null ? '' : ' · ${formatMeetingNumber(meeting.number!)}';
    return Material(
      key: const Key('meeting-bar'),
      color: const Color(0xFF1F7A45),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Row(
          children: [
            const Icon(Icons.circle, size: 10, color: Color(0xFF8DFFB5)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                joining ? 'Joining the meeting…' : 'In a meeting$number',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (!joining)
              FilledButton.tonal(
                style: FilledButton.styleFrom(
                  // The app theme makes buttons full-width; inside a Row that must be overridden.
                  minimumSize: const Size(72, 36),
                  visualDensity: VisualDensity.compact,
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF1F7A45),
                ),
                onPressed: ref.read(meetingControllerProvider.notifier).returnToMeeting,
                child: const Text('Return'),
              ),
          ],
        ),
      ),
    );
  }
}
