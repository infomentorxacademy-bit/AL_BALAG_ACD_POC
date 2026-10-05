import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/session_controller.dart';
import '../chat/channel_list_controller.dart';
import '../chat/channel_list_screen.dart';
import '../meeting/meeting_bar.dart';
import '../meeting/meeting_controller.dart';
import '../meeting/meeting_screen.dart';
import '../settings/server_settings_dialog.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> with WidgetsBindingObserver {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Connect to chat as soon as the signed-in shell appears.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final user = ref.read(sessionProvider);
      if (user != null) {
        ref
            .read(channelListControllerProvider.notifier)
            .start(userId: user.userId, nickname: user.displayName);
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Back from the full-screen meeting (or from Settings): Zoom events may have been missed.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(meetingControllerProvider.notifier).syncWithZoom();
    }
  }

  Future<void> _signOut() async {
    await ref.read(channelListControllerProvider.notifier).stop();
    await ref.read(sessionProvider.notifier).signOut();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider);
    final titles = ['Chats', 'Meeting'];

    return Scaffold(
      appBar: AppBar(
        title: Text(titles[_index]),
        actions: [
          IconButton(
            tooltip: 'Backend server',
            icon: const Icon(Icons.dns_outlined),
            onPressed: () => showServerSettingsDialog(context),
          ),
          PopupMenuButton<String>(
            tooltip: 'Account',
            icon: CircleAvatar(
              radius: 15,
              child: Text((user?.displayName.isNotEmpty ?? false) ? user!.displayName[0].toUpperCase() : '?'),
            ),
            onSelected: (v) {
              if (v == 'signout') _signOut();
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                enabled: false,
                child: Text('Signed in as ${user?.userId ?? ''}'),
              ),
              const PopupMenuItem(value: 'signout', child: Text('Sign out')),
            ],
          ),
          const SizedBox(width: 8),
        ],
      ),
      // IndexedStack keeps the chat list and its scroll position alive while on the Meeting tab.
      body: Column(
        children: [
          const MeetingBar(),
          Expanded(
            child: IndexedStack(
              index: _index,
              children: const [ChannelListScreen(), MeetingScreen()],
            ),
          ),
        ],
      ),
      floatingActionButton: _index == 0
          ? FloatingActionButton.extended(
              onPressed: () => startNewChat(context, ref),
              icon: const Icon(Icons.edit_outlined),
              label: const Text('New chat'),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble),
            label: 'Chats',
          ),
          NavigationDestination(
            icon: Icon(Icons.videocam_outlined),
            selectedIcon: Icon(Icons.videocam),
            label: 'Meeting',
          ),
        ],
      ),
    );
  }
}
