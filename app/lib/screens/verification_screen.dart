import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'kyc_capture_screen.dart';

const _labels = <String, String>{
  'email': 'Email',
  'id': 'ID document',
  'face': 'Face / selfie',
  'address': 'Proof of address',
};

/// Complete KYC: a member must verify every required item before joining a
/// group or moving money (backend ADR-12).
class VerificationScreen extends ConsumerStatefulWidget {
  const VerificationScreen({super.key});

  @override
  ConsumerState<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends ConsumerState<VerificationScreen> {
  late Future<VerificationStatus> _future;
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _code = TextEditingController();
  bool _emailSent = false;

  @override
  void initState() {
    super.initState();
    _future = ref.read(apiClientProvider).verificationStatus();
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  void _refresh() {
    setState(() => _future = ref.read(apiClientProvider).verificationStatus());
  }

  /// Open the live-camera capture for id/face; refresh on a submission so the
  /// item flips to "pending".
  Future<void> _capture(String kind) async {
    final submitted = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => KycCaptureScreen(kind: kind)),
    );
    if (submitted == true && mounted) _refresh();
  }

  Future<void> _run(Future<void> Function() action) async {
    try {
      await action();
      if (mounted) _refresh();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verify your identity')),
      body: FutureBuilder<VerificationStatus>(
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

  Widget _content(VerificationStatus status) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          status.verified
              ? 'You are fully verified — you can join a group.'
              : 'Verify every item below to join a group and move money.',
          style: const TextStyle(fontSize: 15, color: BoblyColors.slate),
        ),
        const SizedBox(height: 16),
        _nameCard(),
        _emailCard(status.items['email'] ?? 'unverified'),
        for (final kind in const ['id', 'face', 'address'])
          _docCard(kind, status.items[kind] ?? 'unverified'),
        if (status.verified) ...[
          const SizedBox(height: 12),
          FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
        ],
      ],
    );
  }

  Widget _statusChip(String status) {
    final (bg, fg) = switch (status) {
      'verified' => (BoblyColors.success, Colors.white),
      'pending' => (BoblyColors.warning, Colors.white),
      'rejected' => (BoblyColors.danger, Colors.white),
      _ => (BoblyColors.mist, BoblyColors.slate),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(status, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w700)),
    );
  }

  Widget _nameCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Your first name', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            const Text('Shown to your group members instead of your number.',
                style: TextStyle(color: BoblyColors.slate, fontSize: 13)),
            const SizedBox(height: 10),
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'First name')),
            const SizedBox(height: 10),
            OutlinedButton(
              onPressed: () => _run(() async {
                await ref.read(apiClientProvider).setProfile(_name.text.trim());
                if (mounted) showInfo(context, 'Saved');
              }),
              child: const Text('Save name'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _emailCard(String status) {
    final done = status == 'verified';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Expanded(child: Text(_labels['email']!, style: const TextStyle(fontWeight: FontWeight.w700))),
              _statusChip(status),
            ]),
            if (!done) ...[
              const SizedBox(height: 12),
              if (!_emailSent) ...[
                TextField(controller: _email, keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(labelText: 'Email address')),
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: () => _run(() async {
                    await ref.read(apiClientProvider).requestEmailCode(_email.text.trim());
                    if (mounted) setState(() => _emailSent = true);
                    showInfo(context, 'We emailed you a 6-digit code');
                  }),
                  child: const Text('Send code'),
                ),
              ] else ...[
                TextField(controller: _code, keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                    decoration: const InputDecoration(labelText: '6-digit code')),
                const SizedBox(height: 10),
                FilledButton(
                  onPressed: () => _run(() => ref.read(apiClientProvider).verifyEmailCode(_code.text.trim())),
                  child: const Text('Confirm email'),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _docCard(String kind, String status) {
    final done = status == 'verified';
    final pending = status == 'pending';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(child: Text(_labels[kind]!, style: const TextStyle(fontWeight: FontWeight.w700))),
            if (done || pending)
              _statusChip(status)
            else if (kind == 'id' || kind == 'face')
              // ID and face are captured live on the camera (ADR-16).
              OutlinedButton.icon(
                onPressed: () => _capture(kind),
                icon: const Icon(Icons.photo_camera_outlined, size: 18),
                label: Text(kind == 'face' ? 'Take selfie' : 'Scan ID'),
              )
            else
              OutlinedButton(
                onPressed: () => _run(() async {
                  // Proof of address is a document reference for the pilot.
                  await ref.read(apiClientProvider).submitKyc(kind, '$kind-submission');
                  if (mounted) showInfo(context, 'Submitted for review');
                }),
                child: const Text('Submit'),
              ),
          ],
        ),
      ),
    );
  }
}
