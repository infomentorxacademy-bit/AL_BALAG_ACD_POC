import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/session_controller.dart';
import 'features/home/home_shell.dart';

class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(sessionProvider) != null;
    return MaterialApp(
      title: 'AL Balag POC',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: ThemeMode.system,
      home: signedIn ? const HomeShell() : const LoginScreen(),
    );
  }
}
