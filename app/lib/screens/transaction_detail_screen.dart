import 'package:flutter/material.dart';

import '../models.dart';
import '../theme.dart';
import '../widgets/format.dart';

/// A full receipt for one wallet entry. Payouts show the fee breakdown
/// (spec §5 — the fee appears on every receipt).
class TransactionDetailScreen extends StatelessWidget {
  final WalletEntry entry;
  const TransactionDetailScreen({super.key, required this.entry});

  @override
  Widget build(BuildContext context) {
    final value = double.tryParse(entry.amount) ?? 0;
    final neutral = neutralEntryTypes.contains(entry.type);
    final color = neutral ? BoblyColors.slate : (value >= 0 ? BoblyColors.success : BoblyColors.danger);

    return Scaffold(
      appBar: AppBar(title: const Text('Receipt')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Text(entryLabels[entry.type] ?? entry.type,
                      style: const TextStyle(fontSize: 16, color: BoblyColors.slate)),
                  const SizedBox(height: 6),
                  Text(formatKes(entry.amount),
                      style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: color)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          if (entry.type == 'payout') _payoutBreakdown(),
          Card(
            child: Column(
              children: [
                _row('When', formatWhen(entry.at)),
                if (entry.hourIndex != null) _row('Hour', 'Hour ${entry.hourIndex! + 1} of the cycle'),
                if (entry.groupId != null) _row('Group', entry.groupId!),
                _row('Type', entry.type),
              ],
            ),
          ),
          const SizedBox(height: 10),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 4),
            child: Text('Every debit, payout and fee is recorded here — nothing moves without a receipt.',
                style: TextStyle(color: BoblyColors.slate, fontSize: 13)),
          ),
        ],
      ),
    );
  }

  Widget _payoutBreakdown() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            _row('Pot', 'KES 24.00'),
            _row('Fee (5%)', '− KES 1.20'),
            const Divider(),
            _row('You received', 'KES 22.80', bold: true),
          ],
        ),
      ),
    );
  }

  Widget _row(String k, String v, {bool bold = false}) {
    final style = TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w500);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(child: Text(k, style: const TextStyle(color: BoblyColors.slate))),
          Flexible(child: Text(v, textAlign: TextAlign.right, style: style)),
        ],
      ),
    );
  }
}
