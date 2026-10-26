import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/format.dart';
import '../widgets/ui.dart';
import 'topup_screen.dart';
import 'transaction_detail_screen.dart';
import 'withdraw_screen.dart';

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

  Future<void> _openTopUp() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => TopUpScreen(walletId: widget.walletId)),
    );
    if (changed == true) _refresh();
  }

  Future<void> _openWithdraw(double available, double min) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => WithdrawScreen(walletId: widget.walletId, available: available, withdrawalMin: min),
      ),
    );
    if (changed == true) _refresh();
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
    final available = double.tryParse(w.available) ?? 0;
    final held = double.tryParse(w.held) ?? 0;
    final min = double.tryParse(w.withdrawalMin) ?? 0;
    final canWithdraw = available >= min && available > 0;
    // Low while an active cycle still needs hourly contributions: Held > 0
    // means a cycle is running, and Available < 1 can't cover the next hour.
    final low = held > 0 && available < 1;

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
                const Text('Available', style: TextStyle(color: Colors.white70)),
                const SizedBox(height: 6),
                Text(formatKes(w.available),
                    style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800)),
                if (held > 0) ...[
                  const SizedBox(height: 12),
                  Text('Held ${formatKes(w.held)} — returned as your cycle runs',
                      style: const TextStyle(color: Colors.white70, fontSize: 13)),
                ],
              ],
            ),
          ),
        ),
        if (low) const _LowBalanceBanner(),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: FilledButton(onPressed: _openTopUp, child: const Text('Top up'))),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton(
                onPressed: canWithdraw ? () => _openWithdraw(available, min) : null,
                child: Text(canWithdraw ? 'Withdraw' : 'Min ${formatKes(w.withdrawalMin)}'),
              ),
            ),
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
    final neutral = neutralEntryTypes.contains(e.type);
    final color = neutral ? BoblyColors.slate : (value >= 0 ? BoblyColors.success : BoblyColors.danger);
    final subtitle = e.type == 'payout'
        ? 'Pot KES 24.00 · fee KES 1.20 (5%) · you received'
        : formatWhen(e.at);
    return Card(
      child: ListTile(
        title: Text(entryLabels[e.type] ?? e.type),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
        trailing: Text(formatKes(e.amount), style: TextStyle(fontWeight: FontWeight.w700, color: color)),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => TransactionDetailScreen(entry: e)),
        ),
      ),
    );
  }
}

class _LowBalanceBanner extends StatelessWidget {
  const _LowBalanceBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: BoblyColors.warning.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: BoblyColors.warning.withValues(alpha: 0.4)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.warning_amber_rounded, color: BoblyColors.warning),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Your wallet is low. Top up to keep your hourly contributions going — you have a 6-hour grace '
              'before a missed hour counts against you.',
              style: TextStyle(color: BoblyColors.ink, fontSize: 13, height: 1.3),
            ),
          ),
        ],
      ),
    );
  }
}
