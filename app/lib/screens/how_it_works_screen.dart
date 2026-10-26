import 'package:flutter/material.dart';

import '../theme.dart';

/// Plain-language explanation of the mechanic, the fee and the early-turn
/// rule (product spec §9 — trust is the product).
class HowItWorksScreen extends StatelessWidget {
  const HowItWorksScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('How it works')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          _Step('One bob an hour', 'Everyone in a Daily group puts in KES 1 every hour — KES 24 over the day.'),
          _Step('Your turn, once a day', 'Each hour the whole pot goes to one member. In a 24-member group your turn comes once a day.'),
          _Step('You get KES 22.80', 'The pot is KES 24. We take a 5% fee (KES 1.20) and you receive KES 22.80 — your own money back, minus the fee.'),
          _Step('The 5% fee', 'That KES 1.20 is the only charge, taken from each payout. It is shown before you join and on every receipt. Nothing is added at withdrawal beyond the M-Pesa network cost.'),
          _Step('Your KES 24 is locked, not spent', 'When you join, your KES 24 for the day is locked and used KES 1 each hour. It is your own money — released as the cycle runs.'),
          _Step('Why the lock (early turns)', 'If your turn comes early, you get the lump sum before you have paid the whole day. The lock guarantees the hours you still owe, so no one can take a payout and stop paying. That keeps every member safe.'),
          _Step('First to secure, first paid', 'Once your group is full, turns run in the order members posted their security — first come, first served.'),
          _Step('Not an investment', 'This is not savings with returns, a loan, or an investment. You get your own money back, minus the 5% fee. We never promise growth.'),
          SizedBox(height: 12),
          _Trust(),
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  final String title;
  final String body;
  const _Step(this.title, this.body);

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: BoblyColors.primary)),
            const SizedBox(height: 6),
            Text(body, style: const TextStyle(color: BoblyColors.ink, height: 1.35)),
          ],
        ),
      ),
    );
  }
}

class _Trust extends StatelessWidget {
  const _Trust();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: BoblyColors.mist.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Text(
        'Funds are held with a licensed partner, and the company and its officials are named in the app. '
        'If anything goes wrong, open Help & disputes — a person replies within 24 hours.',
        style: TextStyle(color: BoblyColors.slate, fontSize: 13, height: 1.35),
      ),
    );
  }
}
