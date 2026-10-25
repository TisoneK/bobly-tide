import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/format.dart';
import '../widgets/ui.dart';

const _typeLabels = <String, String>{
  'topup': 'Top-up',
  'hourly_debit': 'Hourly contribution',
  'payout': 'Payout',
  'fee': 'Fee',
  'withdrawal': 'Withdrawal',
  'hold': 'Security hold',
  'hold_release': 'Hold release',
  'refund': 'Refund',
};

class WalletScreen extends ConsumerStatefulWidget {
  final String walletId;
  const WalletScreen({super.key, required this.walletId});

  @override
  ConsumerState<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends ConsumerState<WalletScreen> {
  late Future<WalletView> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(apiClientProvider).getWallet(widget.walletId);
  }

  void _refresh() {
    setState(() => _future = ref.read(apiClientProvider).getWallet(widget.walletId));
  }

  Future<void> _topup() async {
    final req = await _amountSheet('Top up', 'You\'ll get an M-Pesa prompt to confirm.');
    if (req == null) return;
    try {
      await ref.read(apiClientProvider).topup(widget.walletId, req.amount, req.phone);
      if (mounted) showInfo(context, 'Enter your M-Pesa PIN on your phone to confirm.');
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _withdraw() async {
    final req = await _amountSheet('Withdraw', 'Sent to your M-Pesa number.');
    if (req == null) return;
    try {
      await ref.read(apiClientProvider).withdraw(widget.walletId, req.amount, req.phone);
      if (mounted) showInfo(context, 'Withdrawal sent — it reflects once M-Pesa confirms.');
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<_AmountRequest?> _amountSheet(String title, String subtitle) {
    final amount = TextEditingController();
    final phone = TextEditingController();
    return showModalBottomSheet<_AmountRequest>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20, right: 20, top: 20, bottom: MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(subtitle, style: const TextStyle(color: BoblyColors.slate)),
            const SizedBox(height: 16),
            TextField(
              controller: amount,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Amount (KES)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: phone,
              keyboardType: TextInputType.phone,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(12)],
              decoration: const InputDecoration(labelText: 'M-Pesa number', hintText: '2547XXXXXXXX'),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () {
                final a = int.tryParse(amount.text.trim());
                final p = phone.text.trim();
                if (a == null || a <= 0 || !RegExp(r'^2547\d{8}$').hasMatch(p)) {
                  showInfo(ctx, 'Enter a whole amount and a 2547XXXXXXXX number');
                  return;
                }
                Navigator.of(ctx).pop(_AmountRequest(a, p));
              },
              child: Text(title),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Wallet'),
        actions: [IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh))],
      ),
      body: FutureBuilder<WalletView>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) return ErrorRetry(error: snap.error!, onRetry: _refresh);
          return _content(snap.data!);
        },
      ),
    );
  }

  Widget _content(WalletView w) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          color: BoblyColors.primary,
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Wallet balance', style: TextStyle(color: Colors.white70)),
                const SizedBox(height: 6),
                Text(formatKes(w.balance),
                    style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: FilledButton(onPressed: _topup, child: const Text('Top up'))),
            const SizedBox(width: 12),
            Expanded(child: OutlinedButton(onPressed: _withdraw, child: const Text('Withdraw'))),
          ],
        ),
        const SizedBox(height: 20),
        const Text('Recent activity', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        if (w.entries.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: Text('No activity yet.', style: TextStyle(color: BoblyColors.slate))),
          )
        else
          ...w.entries.map(_entryTile),
      ],
    );
  }

  Widget _entryTile(WalletEntry e) {
    final value = double.tryParse(e.amount) ?? 0;
    final positive = value >= 0;
    return Card(
      child: ListTile(
        title: Text(_typeLabels[e.type] ?? e.type),
        subtitle: Text(e.at),
        trailing: Text(
          formatKes(e.amount),
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: positive ? BoblyColors.success : BoblyColors.danger,
          ),
        ),
      ),
    );
  }
}

class _AmountRequest {
  final int amount;
  final String phone;
  const _AmountRequest(this.amount, this.phone);
}
