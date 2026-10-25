import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../phone.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'otp_screen.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _phone = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    final phone = normalizePhone(_phone.text);
    if (phone == null) {
      showInfo(context, 'Enter a valid Safaricom number (07…, 01… or 2547…)');
      return;
    }
    setState(() => _loading = true);
    try {
      await ref.read(apiClientProvider).requestOtp(phone);
      if (!mounted) return;
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => OtpScreen(phone: phone)));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              const Text('Bobly Tide',
                  style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, color: BoblyColors.primary)),
              const SizedBox(height: 8),
              const Text('One bob. Every hour. Your turn.',
                  style: TextStyle(fontSize: 16, color: BoblyColors.slate)),
              const SizedBox(height: 40),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(13)],
                decoration: const InputDecoration(
                  labelText: 'M-Pesa number',
                  hintText: '07XX XXX XXX',
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _loading ? null : _requestCode,
                child: _loading
                    ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Send code'),
              ),
              const SizedBox(height: 14),
              const Text(
                'By continuing you agree to the Terms and Privacy Policy. Your number is used to secure your account.',
                textAlign: TextAlign.center,
                style: TextStyle(color: BoblyColors.slate, fontSize: 12),
              ),
              const Spacer(flex: 2),
            ],
          ),
        ),
      ),
    );
  }
}
