import 'package:flutter/material.dart';

import '../theme.dart';

/// Short, human-friendly form of a UUID for ops lists ("a1b2c3d4").
String shortId(String id) => id.replaceAll('-', '').substring(0, id.length >= 8 ? 8 : id.length);

/// Compact "2h ago" from an ISO timestamp.
String ago(String iso) {
  final t = DateTime.tryParse(iso);
  if (t == null) return '';
  final d = DateTime.now().difference(t);
  if (d.inMinutes < 1) return 'just now';
  if (d.inMinutes < 60) return '${d.inMinutes}m ago';
  if (d.inHours < 24) return '${d.inHours}h ago';
  return '${d.inDays}d ago';
}

/// A small coloured chip for a group's lifecycle state.
class OpsStateChip extends StatelessWidget {
  final String state;
  const OpsStateChip({super.key, required this.state});

  @override
  Widget build(BuildContext context) {
    final color = switch (state) {
      'active' => BoblyColors.success,
      'completed' => BoblyColors.slate,
      'dissolved' => BoblyColors.danger,
      _ => BoblyColors.tide, // filling
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(999)),
      child: Text(state, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
    );
  }
}

/// Shown when a non-admin reaches an ops tab (the backend returns 403). The
/// client has no "am I admin" flag, so each tab surfaces this friendly state
/// rather than an error.
class NotOpsView extends StatelessWidget {
  const NotOpsView({super.key});

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
            Text('Ops access only', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            SizedBox(height: 6),
            Text('This console is for Bobly Tide operators. Your account is not an ops admin.',
                textAlign: TextAlign.center, style: TextStyle(color: BoblyColors.slate)),
          ],
        ),
      ),
    );
  }
}
