import 'package:flutter/material.dart';

import '../theme.dart';
import '../widgets/ui.dart';

/// Help & dispute entry point (product spec §9, §12 — a human replies within
/// 24 hours, faster for money issues).
class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Help & disputes')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('We reply within 24 hours — faster for money issues.',
              style: TextStyle(color: BoblyColors.slate)),
          const SizedBox(height: 16),
          _ContactTile(
            icon: Icons.chat_bubble_outline,
            title: 'WhatsApp',
            subtitle: '+254 700 000 000',
            onTap: () => showInfo(context, 'Opens WhatsApp (wired at integration)'),
          ),
          _ContactTile(
            icon: Icons.call_outlined,
            title: 'Call support',
            subtitle: '+254 700 000 000',
            onTap: () => showInfo(context, 'Starts a call (wired at integration)'),
          ),
          _ContactTile(
            icon: Icons.flag_outlined,
            title: 'Raise a dispute',
            subtitle: 'About a payout, a hold, or a charge',
            onTap: () => _disputeSheet(context),
          ),
          const SizedBox(height: 16),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'In a dispute, your security stays locked and your turn is protected until it is resolved. '
                'Nothing about your money changes without a record you can see.',
                style: TextStyle(color: BoblyColors.slate, fontSize: 13, height: 1.35),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _disputeSheet(BuildContext context) {
    final msg = TextEditingController();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Raise a dispute', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            TextField(
              controller: msg,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'What happened?', alignLabelWithHint: true),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                showInfo(context, 'Dispute sent — we reply within 24 hours');
              },
              child: const Text('Submit'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ContactTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _ContactTile({required this.icon, required this.title, required this.subtitle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon, color: BoblyColors.primary),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right, color: BoblyColors.slate),
        onTap: onTap,
      ),
    );
  }
}
