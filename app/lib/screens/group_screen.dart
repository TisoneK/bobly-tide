import 'dart:async';

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
  Timer? _ticker;
  DateTime _now = DateTime.now();
  bool _securing = false;

  @override
  void initState() {
    super.initState();
    _future = ref.read(apiClientProvider).getGroup(widget.groupId);
    // Drives the live countdown to the member's turn.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  void _refresh() {
    setState(() => _future = ref.read(apiClientProvider).getGroup(widget.groupId));
  }

  Future<void> _secure() async {
    setState(() => _securing = true);
    try {
      await ref.read(apiClientProvider).secure(widget.groupId);
      if (mounted) showInfo(context, 'Security posted — your turn is claimed');
      _refresh();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _securing = false);
    }
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
          if (snap.hasError) return ErrorRetry(error: snap.error!, onRetry: _refresh);
          return _content(snap.data!);
        },
      ),
    );
  }

  Widget _content(GroupView group) {
    final membership = ref.watch(membershipProvider);
    final mine = (membership != null && membership.groupId == group.id) ? membership : null;
    final members = [...group.members]
      ..sort((a, b) => (a.turnPosition ?? a.joinOrder).compareTo(b.turnPosition ?? b.joinOrder));

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _StateBanner(group: group),
        const SizedBox(height: 16),
        _turnCard(group),
        if (group.isFilling && !group.yourSecured) ...[
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _securing ? null : _secure,
            child: _securing
                ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Post my security & claim my turn'),
          ),
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text('Turns are first-come-first-served — secure earlier for an earlier turn.',
                style: TextStyle(color: BoblyColors.slate, fontSize: 13)),
          ),
        ],
        const SizedBox(height: 16),
        const Text('Turn order', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        ...members.map((m) {
          final secured = m.turnPosition != null;
          return Card(
            color: m.isYou ? BoblyColors.primaryLight.withOpacity(0.08) : null,
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: m.isYou ? BoblyColors.primary : BoblyColors.mist,
                foregroundColor: m.isYou ? Colors.white : BoblyColors.ink,
                child: Text(secured ? '${m.turnPosition}' : '·'),
              ),
              title: Text(m.isYou ? 'You' : 'Member ${m.joinOrder}',
                  style: TextStyle(fontWeight: m.isYou ? FontWeight.w700 : FontWeight.w500)),
              subtitle: Text(secured ? 'Secured' : (m.state == 'active' ? 'Not secured yet' : m.state),
                  style: const TextStyle(color: BoblyColors.slate)),
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

  Widget _turnCard(GroupView group) {
    final pos = group.yourPosition;
    String line;
    if (!group.yourSecured) {
      line = 'Secure your spot to get a turn';
    } else if (group.isActive && group.yourTurnAt != null) {
      final at = DateTime.tryParse(group.yourTurnAt!);
      if (at == null) {
        line = 'Turn position #$pos';
      } else {
        final remaining = at.difference(_now);
        line = remaining.isNegative ? 'Your turn has arrived 🎉' : 'Your turn in ${_fmt(remaining)}';
      }
    } else {
      line = 'Turn position #$pos · starts when the group is full';
    }

    return Card(
      color: BoblyColors.primaryLight.withOpacity(0.08),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(pos != null ? 'Your turn · position #$pos' : 'Your turn',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(line, style: const TextStyle(color: BoblyColors.slate)),
                ],
              ),
            ),
            Text(formatKes(group.yourBalance),
                style: const TextStyle(fontWeight: FontWeight.w800, color: BoblyColors.primary)),
          ],
        ),
      ),
    );
  }

  static String _fmt(Duration d) {
    String two(int n) => n.toString().padLeft(2, '0');
    if (d.inDays > 0) return '${d.inDays}d ${d.inHours % 24}h ${d.inMinutes % 60}m';
    return '${two(d.inHours)}:${two(d.inMinutes % 60)}:${two(d.inSeconds % 60)}';
  }
}

class _StateBanner extends StatelessWidget {
  final GroupView group;
  const _StateBanner({required this.group});

  @override
  Widget build(BuildContext context) {
    if (group.isFilling) {
      final progress = group.size == 0 ? 0.0 : group.joined / group.size;
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
              Text('${group.joined} of ${group.size} joined · ${group.securedCount} secured',
                  style: const TextStyle(color: BoblyColors.slate)),
              const SizedBox(height: 4),
              const Text('Your group starts once everyone has secured their spot.',
                  style: TextStyle(color: BoblyColors.slate)),
            ],
          ),
        ),
      );
    }

    final (label, color) = switch (group.state) {
      'active' => ('Live — turns are running', BoblyColors.success),
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
