/// Format a decimal-string amount as "KES 22.80".
String formatKes(String amount) {
  final n = double.tryParse(amount);
  if (n == null) return 'KES $amount';
  return 'KES ${n.toStringAsFixed(2)}';
}
