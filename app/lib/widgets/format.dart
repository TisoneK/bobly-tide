/// Format a decimal-string amount as "KES 22.80".
String formatKes(String amount) {
  final n = double.tryParse(amount);
  if (n == null) return 'KES $amount';
  return 'KES ${n.toStringAsFixed(2)}';
}

/// Human labels for ledger entry types.
const entryLabels = <String, String>{
  'topup': 'Top-up',
  'hourly_debit': 'Hourly contribution',
  'payout': 'Payout',
  'fee': 'Fee',
  'withdrawal': 'Withdrawal',
  'hold': 'Security held',
  'hold_release': 'Security released',
  'refund': 'Refund',
};

/// Hold moves are the member's own money shifting between Available and Held —
/// neutral, not a gain or a loss.
const neutralEntryTypes = {'hold', 'hold_release'};

/// A readable timestamp from an ISO string, e.g. "2026-10-25 14:03".
String formatWhen(String iso) {
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  final l = d.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${l.year}-${two(l.month)}-${two(l.day)} ${two(l.hour)}:${two(l.minute)}';
}
