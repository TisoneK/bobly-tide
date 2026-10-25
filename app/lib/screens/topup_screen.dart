import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../phone.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/format.dart';
import '../widgets/ui.dart';

/// Top up by M-Pesa STK push. The wallet is credited only when M-Pesa
/// confirms (backend ADR-8), so this ends on a "check your phone" state.
/// Pops `true` when the member returns, so the wallet refetches.
class TopUpScreen extends ConsumerStatefulWidget {
  final String walletId;
  const TopUpScreen({super.key, required this.walletId});

  @override
  ConsumerState<TopUpScreen> createState() => _TopUpScreenState();
}

class _TopUpScreenState extends ConsumerState<TopUpScreen> {
  final _amount = TextEditingController(text: '24');
  final _phone = TextEditingController();
  bool _loading = false;
  int? _pendingAmount; // set once the prompt is sent

  @override
  void initState() {
    super.initState();
    _phone.text = ref.read(signedInPhoneProvider) ?? '';
  }

  @override
  void dispose() {
    _amount.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final amount = int.tryParse(_amount.text.trim());
    final phone = normalizePhone(_phone.text);
    if (amount == null || amount <= 0) {
      showInfo(context, 'Enter a whole amount in shillings');
      return;
    }
    if (phone == null) {
      showInfo(context, 'Enter a valid M-Pesa number');
      return;
    }
    setState(() => _loading = true);
    try {
      await ref.read(apiClientProvider).topup(widget.walletId, amount, phone);
      if (mounted) setState(() => _pendingAmount = amount);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Top up')),
      body: _pendingAmount == null ? _form() : _pending(_pendingAmount!),
    );
  }

  Widget _form() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _amount,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(labelText: 'Amount (KES)'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(labelText: 'M-Pesa number'),
        ),
        const SizedBox(height: 6),
        const Text('You will get an M-Pesa prompt on this phone to confirm.',
            style: TextStyle(color: BoblyColors.slate, fontSize: 13)),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _loading ? null : _submit,
          child: _loading
              ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Request M-Pesa prompt'),
        ),
      ],
    );
  }

  Widget _pending(int amount) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.phonelink_ring, size: 56, color: BoblyColors.primary),
          const SizedBox(height: 16),
          const Text('Check your phone', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text('Enter your M-Pesa PIN to pay ${formatKes('$amount')}. Your wallet updates once M-Pesa confirms — it may take a moment.',
              textAlign: TextAlign.center, style: const TextStyle(color: BoblyColors.slate, height: 1.35)),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Back to wallet'),
          ),
        ],
      ),
    );
  }
}
