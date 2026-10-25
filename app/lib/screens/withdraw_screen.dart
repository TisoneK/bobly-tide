import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../phone.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/format.dart';
import '../widgets/ui.dart';

/// Withdraw by M-Pesa B2C to the member's own number. The funds are reserved
/// immediately and reflect once M-Pesa confirms (backend ADR-8). Pops `true`
/// on return so the wallet refetches.
class WithdrawScreen extends ConsumerStatefulWidget {
  final String walletId;
  final double available;
  final double withdrawalMin;
  const WithdrawScreen({
    super.key,
    required this.walletId,
    required this.available,
    required this.withdrawalMin,
  });

  @override
  ConsumerState<WithdrawScreen> createState() => _WithdrawScreenState();
}

class _WithdrawScreenState extends ConsumerState<WithdrawScreen> {
  final _amount = TextEditingController();
  late String _phone;
  bool _loading = false;
  int? _sentAmount;

  @override
  void initState() {
    super.initState();
    _phone = ref.read(signedInPhoneProvider) ?? '';
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final amount = int.tryParse(_amount.text.trim());
    final phone = normalizePhone(_phone);
    if (amount == null || amount < widget.withdrawalMin) {
      showInfo(context, 'Minimum withdrawal is ${formatKes('${widget.withdrawalMin}')}');
      return;
    }
    if (amount > widget.available) {
      showInfo(context, 'You can withdraw up to ${formatKes('${widget.available}')}');
      return;
    }
    if (phone == null) {
      showInfo(context, 'No valid M-Pesa number on file');
      return;
    }
    setState(() => _loading = true);
    try {
      await ref.read(apiClientProvider).withdraw(widget.walletId, amount, phone);
      if (mounted) setState(() => _sentAmount = amount);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Withdraw')),
      body: _sentAmount == null ? _form() : _sent(_sentAmount!),
    );
  }

  Widget _form() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: ListTile(
            title: const Text('Available to withdraw'),
            trailing: Text(formatKes('${widget.available}'),
                style: const TextStyle(fontWeight: FontWeight.w800, color: BoblyColors.primary)),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _amount,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(
            labelText: 'Amount (KES)',
            helperText: 'Minimum ${formatKes('${widget.withdrawalMin}')} · sent to $_phone',
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _loading ? null : _submit,
          child: _loading
              ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Withdraw to M-Pesa'),
        ),
      ],
    );
  }

  Widget _sent(int amount) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle_outline, size: 56, color: BoblyColors.success),
          const SizedBox(height: 16),
          const Text('On its way', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text('${formatKes('$amount')} is being sent to $_phone. It reflects once M-Pesa confirms.',
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
