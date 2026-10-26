import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../models.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'ops_common.dart';

/// Security audit tab in the ops console (ADR-24): the recorded rejections,
/// lockouts and anomaly escalations, newest first, with a severity filter.
class SecurityTab extends ConsumerStatefulWidget {
  const SecurityTab({super.key});

  @override
  ConsumerState<SecurityTab> createState() => _SecurityTabState();
}

class _SecurityTabState extends ConsumerState<SecurityTab> {
  String? _severity; // null = all
  late Future<List<SecurityEvent>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<SecurityEvent>> _load() =>
      ref.read(apiClientProvider).adminSecurityEvents(severity: _severity);

  void _setSeverity(String? s) => setState(() {
        _severity = s;
        _future = _load();
      });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _filterBar(),
        Expanded(
          child: FutureBuilder<List<SecurityEvent>>(
            future: _future,
            builder: (context, snap) {
              if (snap.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snap.hasError) {
                final err = snap.error;
                if (err is ApiException && err.status == 403) return const NotOpsView();
                return ErrorRetry(error: err!, onRetry: () => _setSeverity(_severity));
              }
              final events = snap.data!;
              return RefreshIndicator(
                onRefresh: () async => _setSeverity(_severity),
                child: events.isEmpty
                    ? ListView(children: const [
                        SizedBox(height: 120),
                        Center(child: Text('No security events', style: TextStyle(fontWeight: FontWeight.w700))),
                        SizedBox(height: 6),
                        Center(child: Text('Nothing flagged at this level.', style: TextStyle(color: BoblyColors.slate))),
                      ])
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: events.length,
                        itemBuilder: (_, i) => _eventTile(events[i]),
                      ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _filterBar() {
    final options = <String, String?>{'All': null, 'Warnings+': 'warning', 'Critical': 'critical'};
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Wrap(
        spacing: 8,
        children: options.entries.map((e) {
          final selected = _severity == e.value;
          return ChoiceChip(
            label: Text(e.key),
            selected: selected,
            onSelected: (_) => _setSeverity(e.value),
          );
        }).toList(),
      ),
    );
  }

  Widget _eventTile(SecurityEvent e) {
    return Card(
      child: ListTile(
        leading: Icon(Icons.circle, size: 14, color: _severityColor(e.severity)),
        title: Text(_typeLabel(e.type), style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (e.detail != null) Text(e.detail!, style: const TextStyle(fontSize: 12)),
            Text(
              [if (e.ip != null) 'IP ${e.ip}', if (e.phone != null) e.phone!, ago(e.createdAt)].join(' · '),
              style: const TextStyle(color: BoblyColors.slate, fontSize: 11),
            ),
          ],
        ),
        isThreeLine: e.detail != null,
      ),
    );
  }

  static Color _severityColor(String s) => switch (s) {
        'critical' => BoblyColors.danger,
        'warning' => BoblyColors.warning,
        _ => BoblyColors.slate,
      };

  static String _typeLabel(String t) => switch (t) {
        'auth_failed' => 'Failed sign-in',
        'admin_denied' => 'Admin access denied',
        'ownership_denied' => 'Resource access denied',
        'callback_rejected' => 'Payment callback rejected',
        'otp_locked' => 'OTP locked out',
        'rate_limited' => 'Rate limit exceeded',
        'join_limit' => 'Join limit hit',
        'kyc_rejected' => 'KYC rejected',
        'anomaly_threshold' => '⚠ Anomaly — repeated attempts',
        _ => t,
      };
}
