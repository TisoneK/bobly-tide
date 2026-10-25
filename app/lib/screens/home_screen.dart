import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/format.dart';
import '../widgets/ui.dart';
import 'group_screen.dart';
import 'verification_screen.dart';
import 'wallet_screen.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  bool _loading = false;
  late Future<VerificationStatus> _status;

  @override
  void initState() {
    super.initState();
    _status = ref.read(apiClientProvider).verificationStatus();
  }

  void _refreshStatus() {
    setState(() => _status = ref.read(apiClientProvider).verificationStatus());
  }

  void _signOut() {
    ref.read(membershipProvider.notifier).clear();
    ref.read(sessionProvider.notifier).clear();
  }

  Future<void> _openVerification() async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VerificationScreen()));
    _refreshStatus(); // reflect any items completed while away
  }

  Future<void> _join() async {
    setState(() => _loading = true);
    try {
      final join = await ref.read(apiClientProvider).joinDaily();
      ref.read(membershipProvider.notifier).set(Membership(join.groupId, join));
      if (!mounted) return;
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => GroupScreen(groupId: join.groupId)));
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
            FutureBuilder<VerificationStatus>(
              future: _status,
              builder: (context, snap) {
                if (!snap.hasData) {
                  return const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                return snap.data!.verified
                    ? _JoinCard(loading: _loading, onJoin: _join)
                    : _VerifyCard(onVerify: _openVerification);
              },
            ),
        ],
      ),
    );
  }
}

class _VerifyCard extends StatelessWidget {
  final VoidCallback onVerify;
  const _VerifyCard({required this.onVerify});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Verify to join', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            const Text('Confirm your email, ID, face and address before joining a group or moving money.',
                style: TextStyle(color: BoblyColors.slate)),
            const SizedBox(height: 16),
            FilledButton(onPressed: onVerify, child: const Text('Verify my identity')),
          ],
        ),
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
  final bool loading;
  final VoidCallback onJoin;
  const _JoinCard({required this.loading, required this.onJoin});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Join the Daily group', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            const Text('You join the next forming group. It starts once it is full; your turn comes at your position.',
                style: TextStyle(color: BoblyColors.slate)),
            const SizedBox(height: 14),
            const _CostLine('Top up today', 'KES 24', note: 'locked for the day, used KES 1 an hour'),
            const _CostLine('You receive at your turn', 'KES 22.80', note: 'your own money back, minus the 5% fee'),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: BoblyColors.mist.withOpacity(0.5),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Text(
                'Not an investment. You get your own money back, minus a 5% fee on each payout. No returns.',
                style: TextStyle(color: BoblyColors.slate, fontSize: 13),
              ),
            ),
            const SizedBox(height: 14),
            FilledButton(
              onPressed: loading ? null : onJoin,
              child: loading
                  ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Join'),
            ),
          ],
        ),
      ),
    );
  }
}

class _CostLine extends StatelessWidget {
  final String label;
  final String amount;
  final String? note;
  const _CostLine(this.label, this.amount, {this.note});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label),
                if (note != null) Text(note!, style: const TextStyle(color: BoblyColors.slate, fontSize: 12)),
              ],
            ),
          ),
          Text(amount, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
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
