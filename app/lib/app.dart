import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'screens/home_screen.dart';
import 'screens/sign_in_screen.dart';
import 'state/providers.dart';
import 'theme.dart';

class BoblyApp extends StatelessWidget {
  const BoblyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Bobly Tide',
      debugShowCheckedModeBanner: false,
      theme: boblyTheme(),
      home: const AuthGate(),
    );
  }
}

/// Shows the sign-in flow until there's a session, then the home screen.
class AuthGate extends ConsumerWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    return session == null ? const SignInScreen() : const HomeScreen();
  }
}
