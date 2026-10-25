import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/format.dart';
import '../widgets/ui.dart';
import 'group_screen.dart';
import 'wallet_screen.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _code = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _signOut() {
    ref.read(membershipProvider.notifier).clear();
    ref.read(sessionProvider.notifier).clear();
  }

  Future<void> _join() async {
    final code = _code.text.trim();
    if (code.isEmpty) {
      showInfo(context, 'Enter the group invite code');
      return;
    }
    setState(() => _loading = true);
    try {
      final join = await ref.read(apiClientProvider).joinGroup(code);
      ref.read(membershipProvider.notifier).set(Membership(code, join));
      if (!mounted) return;
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => GroupScreen(groupId: code)));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final membership = ref.watch(membershipProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bobly Tide'),
        actions: [IconButton(onPressed: _signOut, icon: const Icon(Icons.logout))],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const _PackageCard(),
          const SizedBox(height: 16),
          if (membership != null)
            _YourGroupCard(membership: membership)
          else
            _JoinCard(controller: _code, loading: _loading, onJoin: _join),
        ],
      ),
    );
  }
}

class _PackageCard extends StatelessWidget {
  const _PackageCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('Daily', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: BoblyColors.payout.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text('${formatKes(DailyPackage.payout)} / turn',
                      style: const TextStyle(color: BoblyColors.ink, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
            const SizedBox(height: 10),
            const Text('One bob an hour — KES 24 a day.', style: TextStyle(fontSize: 16)),
            const SizedBox(height: 4),
            const Text('${DailyPackage.size} members · a turn every day · 5% fee',
                style: TextStyle(color: BoblyColors.slate)),
          ],
        ),
      ),
    );
  }
}

class _JoinCard extends StatelessWidget {
  final TextEditingController controller;
  final bool loading;
  final VoidCallback onJoin;
  const _JoinCard({required this.controller, required this.loading, required this.onJoin});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Join a group', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            const Text('Enter the invite code you were given.', style: TextStyle(color: BoblyColors.slate)),
            const SizedBox(height: 16),
            TextField(controller: controller, decoration: const InputDecoration(labelText: 'Group invite code')),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: loading ? null : onJoin,
              child: loading
                  ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Join group'),
            ),
          ],
        ),
      ),
    );
  }
}

class _YourGroupCard extends StatelessWidget {
  final Membership membership;
  const _YourGroupCard({required this.membership});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Your group', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text('Turn position #${membership.join.joinOrder}', style: const TextStyle(color: BoblyColors.slate)),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => GroupScreen(groupId: membership.groupId))),
              child: const Text('View group'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => WalletScreen(walletId: membership.join.walletId))),
              child: const Text('My wallet'),
            ),
          ],
        ),
      ),
    );
  }
}
