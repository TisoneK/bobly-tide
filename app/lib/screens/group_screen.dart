import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/format.dart';
import '../widgets/ui.dart';
import 'wallet_screen.dart';

class GroupScreen extends ConsumerStatefulWidget {
  final String groupId;
  const GroupScreen({super.key, required this.groupId});

  @override
  ConsumerState<GroupScreen> createState() => _GroupScreenState();
}

class _GroupScreenState extends ConsumerState<GroupScreen> {
  late Future<GroupView> _future;

  @override
  void initState() {
    super.initState();
    _future = ref.read(apiClientProvider).getGroup(widget.groupId);
  }

  void _refresh() {
    setState(() => _future = ref.read(apiClientProvider).getGroup(widget.groupId));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Your group'),
        actions: [IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh))],
      ),
      body: FutureBuilder<GroupView>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ErrorRetry(error: snap.error!, onRetry: _refresh);
          }
          return _content(snap.data!);
        },
      ),
    );
  }

  Widget _content(GroupView group) {
    final membership = ref.watch(membershipProvider);
    final mine = (membership != null && membership.groupId == group.id) ? membership : null;
    final members = [...group.members]..sort((a, b) => a.joinOrder.compareTo(b.joinOrder));

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _StateBanner(group: group),
        const SizedBox(height: 16),
        Card(
          color: BoblyColors.primaryLight.withOpacity(0.08),
          child: ListTile(
            title: const Text('Your turn & balance', style: TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text('Position #${group.yourPosition}'),
            trailing: Text(formatKes(group.yourBalance),
                style: const TextStyle(fontWeight: FontWeight.w800, color: BoblyColors.primary)),
          ),
        ),
        const SizedBox(height: 16),
        const Text('Turn order', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        ...members.map((m) {
          final isYou = m.isYou;
          return Card(
            color: isYou ? BoblyColors.primaryLight.withOpacity(0.08) : null,
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: isYou ? BoblyColors.primary : BoblyColors.mist,
                foregroundColor: isYou ? Colors.white : BoblyColors.ink,
                child: Text('${m.joinOrder}'),
              ),
              title: Text(isYou ? 'You' : 'Member ${m.joinOrder}',
                  style: TextStyle(fontWeight: isYou ? FontWeight.w700 : FontWeight.w500)),
              subtitle: m.state == 'active' ? null : Text(m.state),
            ),
          );
        }),
        if (mine != null) ...[
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => WalletScreen(walletId: mine.join.walletId)),
            ),
            icon: const Icon(Icons.account_balance_wallet_outlined),
            label: const Text('My wallet'),
          ),
        ],
      ],
    );
  }
}

class _StateBanner extends StatelessWidget {
  final GroupView group;
  const _StateBanner({required this.group});

  @override
  Widget build(BuildContext context) {
    if (group.isFilling) {
      final progress = group.size == 0 ? 0.0 : group.filled / group.size;
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Waiting to fill', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(value: progress, minHeight: 10, color: BoblyColors.tide),
              ),
              const SizedBox(height: 10),
              Text('${group.filled} of ${group.size} joined · ${group.slotsRemaining} slots left',
                  style: const TextStyle(color: BoblyColors.slate)),
              const SizedBox(height: 4),
              const Text('Your group starts the moment it is full.', style: TextStyle(color: BoblyColors.slate)),
            ],
          ),
        ),
      );
    }

    final (label, color) = switch (group.state) {
      'active' => ('Live — your turns are running', BoblyColors.success),
      'completed' => ('Cycle complete', BoblyColors.slate),
      _ => (group.state, BoblyColors.slate),
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Icon(Icons.circle, size: 12, color: color),
            const SizedBox(width: 10),
            Expanded(child: Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))),
          ],
        ),
      ),
    );
  }
}
