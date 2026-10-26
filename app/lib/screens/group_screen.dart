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
  bool _busy = false; // a cycle-end action (renew/leave) is in flight

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
        if (group.isCompleted) _cycleEndCard(),
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
          final sub = [
            if (m.maskedPhone != null) m.maskedPhone!,
            secured ? 'Secured' : (m.state == 'active' ? 'Not secured yet' : m.state),
          ].join(' · ');
          return Card(
            color: m.isYou ? BoblyColors.primaryLight.withValues(alpha: 0.08) : null,
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: m.isYou ? BoblyColors.primary : BoblyColors.mist,
                foregroundColor: m.isYou ? Colors.white : BoblyColors.ink,
                child: Text(secured ? '${m.turnPosition}' : '·'),
              ),
              title: Text(m.label(), style: TextStyle(fontWeight: m.isYou ? FontWeight.w700 : FontWeight.w500)),
              subtitle: Text(sub, style: const TextStyle(color: BoblyColors.slate, fontSize: 12)),
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

  Widget _cycleEndCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Cycle complete 🎉', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            const Text('Everyone got their turn. What next?', style: TextStyle(color: BoblyColors.slate)),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy ? null : _renew,
              child: _busy
                  ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Renew — start a new cycle'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _busy
                  ? null
                  : () => showInfo(context, 'Daily is the only package in the pilot; more packages come later.'),
              child: const Text('Switch package'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _busy ? null : _confirmLeave,
              child: const Text('Leave', style: TextStyle(color: BoblyColors.danger)),
            ),
          ],
        ),
      ),
    );
  }

  /// Renew after a completed cycle: the server places us in a fresh filling
  /// group; we point the app at it and open its screen.
  Future<void> _renew() async {
    setState(() => _busy = true);
    try {
      final join = await ref.read(apiClientProvider).renewGroup(widget.groupId);
      if (!mounted) return;
      ref.read(membershipProvider.notifier).set(Membership(join.groupId, join));
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => GroupScreen(groupId: join.groupId)),
      );
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmLeave() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave this group?'),
        content: const Text('Your cycle is complete and any remaining balance is in your wallet to withdraw.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Stay')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Leave')),
        ],
      ),
    );
    if (leave != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final result = await ref.read(apiClientProvider).leaveGroup(widget.groupId);
      if (!mounted) return;
      ref.read(membershipProvider.notifier).clear();
      final refunded = double.tryParse(result.refunded) ?? 0;
      if (refunded > 0) {
        showInfo(context, 'You left the group. ${formatKes(result.refunded)} is on its way to your M-Pesa.');
      } else {
        showInfo(context, 'You left the group.');
      }
      Navigator.of(context).popUntil((r) => r.isFirst);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
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
      color: BoblyColors.primaryLight.withValues(alpha: 0.08),
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
              if (group.estimatedStartAt != null) ...[
                const SizedBox(height: 8),
                _estimateLine(group.estimatedStartAt!),
              ],
            ],
          ),
        ),
      );
    }

    return _otherStateCard();
  }

  /// A rough, fill-rate-based "estimated start" line (ADR-21) — never a promise.
  Widget _estimateLine(String iso) {
    final at = DateTime.tryParse(iso);
    if (at == null) return const SizedBox.shrink();
    final d = at.difference(DateTime.now());
    final text = d.inMinutes < 1 ? 'any moment now' : '~${_rough(d)} (estimate)';
    return Row(
      children: [
        const Icon(Icons.schedule, size: 15, color: BoblyColors.slate),
        const SizedBox(width: 6),
        Expanded(
          child: Text('Estimated start $text',
              style: const TextStyle(color: BoblyColors.slate, fontSize: 13)),
        ),
      ],
    );
  }

  static String _rough(Duration d) {
    if (d.inDays >= 1) return '${d.inDays}d ${d.inHours % 24}h';
    if (d.inHours >= 1) return '${d.inHours}h ${d.inMinutes % 60}m';
    return '${d.inMinutes}m';
  }

  Widget _otherStateCard() {
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
