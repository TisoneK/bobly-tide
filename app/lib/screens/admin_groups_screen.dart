import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../models.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'ops_common.dart';

/// Group oversight tab in the ops console: a list of groups with state and
/// fill/secure counts; tap one to see its members (ADR-23).
class GroupsTab extends ConsumerStatefulWidget {
  const GroupsTab({super.key});

  @override
  ConsumerState<GroupsTab> createState() => _GroupsTabState();
}

class _GroupsTabState extends ConsumerState<GroupsTab> {
  late Future<List<AdminGroupSummary>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<AdminGroupSummary>> _load() => ref.read(apiClientProvider).adminListGroups();

  void _refresh() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<AdminGroupSummary>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) {
          final err = snap.error;
          if (err is ApiException && err.status == 403) return const NotOpsView();
          return ErrorRetry(error: err!, onRetry: _refresh);
        }
        final groups = snap.data!;
        return RefreshIndicator(
          onRefresh: () async => _refresh(),
          child: groups.isEmpty
              ? ListView(children: const [
                  SizedBox(height: 120),
                  Center(child: Text('No groups yet', style: TextStyle(fontWeight: FontWeight.w700))),
                ])
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: groups.length,
                  itemBuilder: (_, i) => _groupCard(groups[i]),
                ),
        );
      },
    );
  }

  Widget _groupCard(AdminGroupSummary g) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        title: Row(
          children: [
            Expanded(
              child: Text('Group ${shortId(g.id)}', style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
            OpsStateChip(state: g.state),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            '${g.joined}/${g.size} joined · ${g.secured} secured · opened ${ago(g.createdAt)}',
            style: const TextStyle(color: BoblyColors.slate, fontSize: 12),
          ),
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => AdminGroupDetailScreen(groupId: g.id)),
        ),
      ),
    );
  }
}

/// One group's members + states, for ops oversight.
class AdminGroupDetailScreen extends ConsumerStatefulWidget {
  final String groupId;
  const AdminGroupDetailScreen({super.key, required this.groupId});

  @override
  ConsumerState<AdminGroupDetailScreen> createState() => _AdminGroupDetailScreenState();
}

class _AdminGroupDetailScreenState extends ConsumerState<AdminGroupDetailScreen> {
  late Future<AdminGroupDetail> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<AdminGroupDetail> _load() => ref.read(apiClientProvider).adminGroupDetail(widget.groupId);

  void _refresh() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Group ${shortId(widget.groupId)}'),
        actions: [IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh))],
      ),
      body: FutureBuilder<AdminGroupDetail>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            final err = snap.error;
            if (err is ApiException && err.status == 403) return const NotOpsView();
            return ErrorRetry(error: err!, onRetry: _refresh);
          }
          return _content(snap.data!);
        },
      ),
    );
  }

  Widget _content(AdminGroupDetail g) {
    final members = [...g.members]
      ..sort((a, b) => (a.turnPosition ?? a.joinOrder).compareTo(b.turnPosition ?? b.joinOrder));
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [OpsStateChip(state: g.state)]),
                      const SizedBox(height: 8),
                      Text('${g.joined}/${g.size} joined · ${g.secured} secured',
                          style: const TextStyle(color: BoblyColors.slate)),
                      if (g.startAt != null)
                        Text('Started ${ago(g.startAt!)}',
                            style: const TextStyle(color: BoblyColors.slate, fontSize: 12)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        const Text('Members', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        ...members.map(_memberTile),
      ],
    );
  }

  Widget _memberTile(AdminMember m) {
    final sub = [
      m.phone,
      m.secured ? 'Secured' : 'Not secured',
      if (m.state != 'active') m.state,
    ].join(' · ');
    return Card(
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: m.secured ? BoblyColors.primary : BoblyColors.mist,
          foregroundColor: m.secured ? Colors.white : BoblyColors.ink,
          child: Text(m.secured ? '${m.turnPosition}' : '·'),
        ),
        title: Text(m.name ?? 'Member ${m.joinOrder}', style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(sub, style: const TextStyle(color: BoblyColors.slate, fontSize: 12)),
      ),
    );
  }
}
