import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../settings/server_settings_dialog.dart';
import 'session_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _userId = TextEditingController();
  final _name = TextEditingController();

  @override
  void dispose() {
    _userId.dispose();
    _name.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    ref.read(sessionProvider.notifier).signIn(userId: _userId.text, displayName: _name.text);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Scaffold(
      appBar: AppBar(
        actions: [
          IconButton(
            tooltip: 'Backend server',
            icon: const Icon(Icons.dns_outlined),
            onPressed: () => showServerSettingsDialog(context),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    CircleAvatar(
                      radius: 36,
                      backgroundColor: scheme.primaryContainer,
                      child: Icon(Icons.school_rounded, size: 38, color: scheme.onPrimaryContainer),
                    ),
                    const SizedBox(height: 20),
                    Text('AL Balag POC',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 6),
                    Text('Chat with Sendbird. Meet with Zoom.',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurfaceVariant)),
                    const SizedBox(height: 32),
                    TextFormField(
                      controller: _userId,
                      autocorrect: false,
                      enableSuggestions: false,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: 'User id',
                        hintText: 'e.g. alice',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                      validator: validateUserId,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _name,
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => _submit(),
                      decoration: const InputDecoration(
                        labelText: 'Display name (optional)',
                        prefixIcon: Icon(Icons.badge_outlined),
                      ),
                    ),
                    const SizedBox(height: 24),
                    FilledButton(onPressed: _submit, child: const Text('Continue')),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
