import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../models.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// Ops-only KYC review queue (backend /admin — AdminGuard by ADMIN_PHONES).
/// Non-admins reach this screen from the menu but get a 403, shown as a
/// friendly "ops only" state rather than an error snackbar.
class AdminKycScreen extends ConsumerStatefulWidget {
  const AdminKycScreen({super.key});

  @override
  ConsumerState<AdminKycScreen> createState() => _AdminKycScreenState();
}

class _AdminKycScreenState extends ConsumerState<AdminKycScreen> {
  late Future<List<PendingVerification>> _future;

  /// Rows currently being decided, keyed by '<userId>:<kind>', so a single
  /// card's buttons disable while its review is in flight.
  final Set<String> _working = {};

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<PendingVerification>> _load() => ref.read(apiClientProvider).adminPendingVerifications();

  void _refresh() => setState(() => _future = _load());

  Future<void> _review(PendingVerification v, String decision) async {
    String? reason;
    if (decision == 'rejected') {
      reason = await _askReason();
      if (reason == null) return; // cancelled
    }
    final key = '${v.userId}:${v.kind}';
    setState(() => _working.add(key));
    try {
      await ref.read(apiClientProvider).adminReview(v.userId, v.kind, decision, reason: reason);
      if (!mounted) return;
      showInfo(context, decision == 'verified' ? '${_kindLabel(v.kind)} approved' : '${_kindLabel(v.kind)} rejected');
      _refresh();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _working.remove(key));
    }
  }

  /// Optional note sent back to the member on a rejection.
  Future<String?> _askReason() async {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reject submission'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Reason (optional)',
            hintText: 'e.g. photo blurry — ask for a clearer capture',
          ),
          maxLines: 2,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(null), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(ctrl.text.trim()), child: const Text('Reject')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('KYC review'),
        actions: [IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh))],
      ),
      body: FutureBuilder<List<PendingVerification>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            final err = snap.error;
            if (err is ApiException && err.status == 403) return const _NotOps();
            return ErrorRetry(error: err!, onRetry: _refresh);
          }
          final pending = snap.data!;
          if (pending.isEmpty) return const _EmptyQueue();
          return RefreshIndicator(
            onRefresh: () async => _refresh(),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: pending.length,
              itemBuilder: (_, i) => _reviewCard(pending[i]),
            ),
          );
        },
      ),
    );
  }

  Widget _reviewCard(PendingVerification v) {
    final key = '${v.userId}:${v.kind}';
    final busy = _working.contains(key);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: BoblyColors.mist,
                  foregroundColor: BoblyColors.ink,
                  child: Icon(_kindIcon(v.kind), size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_kindLabel(v.kind), style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text(v.phone, style: const TextStyle(color: BoblyColors.slate, fontSize: 13)),
                    ],
                  ),
                ),
                Text(_ago(v.updatedAt), style: const TextStyle(color: BoblyColors.slate, fontSize: 12)),
              ],
            ),
            if (v.detail != null && v.detail!.isNotEmpty) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: BoblyColors.mist.withOpacity(0.5),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(v.detail!, style: const TextStyle(fontSize: 13)),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy ? null : () => _review(v, 'rejected'),
                    style: OutlinedButton.styleFrom(foregroundColor: BoblyColors.danger),
                    child: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: busy ? null : () => _review(v, 'verified'),
                    child: busy
                        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Approve'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _kindLabel(String kind) => switch (kind) {
        'email' => 'Email',
        'id' => 'ID document',
        'face' => 'Face / liveness',
        'address' => 'Address',
        _ => kind,
      };

  static IconData _kindIcon(String kind) => switch (kind) {
        'email' => Icons.mail_outline,
        'id' => Icons.badge_outlined,
        'face' => Icons.face_outlined,
        'address' => Icons.home_outlined,
        _ => Icons.verified_user_outlined,
      };

  /// Compact "2h ago" style from an ISO timestamp.
  static String _ago(String iso) {
    final t = DateTime.tryParse(iso);
    if (t == null) return '';
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes}m ago';
    if (d.inHours < 24) return '${d.inHours}h ago';
    return '${d.inDays}d ago';
  }
}

class _NotOps extends StatelessWidget {
  const _NotOps();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock_outline, size: 40, color: BoblyColors.slate),
            SizedBox(height: 12),
            Text('Ops access only',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            SizedBox(height: 6),
            Text('This review queue is for Bobly Tide operators. Your account is not an ops admin.',
                textAlign: TextAlign.center, style: TextStyle(color: BoblyColors.slate)),
          ],
        ),
      ),
    );
  }
}

class _EmptyQueue extends StatelessWidget {
  const _EmptyQueue();

  @override
  Widget build(BuildContext context) {
    return ListView(
      // A scrollable child keeps pull-to-refresh working on an empty queue.
      children: const [
        SizedBox(height: 120),
        Icon(Icons.inbox_outlined, size: 40, color: BoblyColors.slate),
        SizedBox(height: 12),
        Center(child: Text('Nothing to review', style: TextStyle(fontWeight: FontWeight.w700))),
        SizedBox(height: 6),
        Center(child: Text('All submissions are cleared.', style: TextStyle(color: BoblyColors.slate))),
      ],
    );
  }
}
