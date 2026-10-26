import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../kyc/smile_kyc.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// On-device KYC capture for the ID document and face/selfie steps, run by the
/// Smile ID SDK (ADR-19, job ownership per ADR-25).
///
/// The flow: the Smile ID capture widget runs the selfie/document + liveness
/// check on-device and uploads straight to the vendor — the images never pass
/// through our server. The SDK owns the job; on success the app reports the
/// vendor job id to `POST /verification/kyc/attach`, and Smile ID resolves the
/// result asynchronously via the backend callback. This screen only launches
/// the flow and reports that it was submitted.
class KycCaptureScreen extends ConsumerStatefulWidget {
  /// 'id' (document) or 'face' (selfie).
  final String kind;
  const KycCaptureScreen({super.key, required this.kind});

  bool get isFace => kind == 'face';

  @override
  ConsumerState<KycCaptureScreen> createState() => _KycCaptureScreenState();
}

class _KycCaptureScreenState extends ConsumerState<KycCaptureScreen> {
  String get _title => widget.isFace ? 'Face check' : 'ID document';

  List<String> get _tips => widget.isFace
      ? const [
          'Hold the phone at eye level in good light.',
          'Fit your whole face in the frame — no hat or sunglasses.',
          'Follow the on-screen prompts: look straight, then blink.',
        ]
      : const [
          'Use your national ID or passport.',
          'Lay it flat on a dark surface and fill the frame.',
          'Keep it sharp and glare-free — all text readable.',
        ];

  /// Launch the Smile ID capture flow full-screen, then record the job id it
  /// returns so the vendor's result callback can resolve our pending item.
  Future<void> _start() async {
    final userId = ref.read(sessionProvider)?.userId;
    if (userId == null) {
      showError(context, 'Sign in again to continue.');
      return;
    }

    String? resultJson;
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (ctx) => Scaffold(
          appBar: AppBar(title: Text(_title)),
          body: smileKycFlow(
            userId: userId,
            kind: widget.kind,
            onDone: (success, _, json) {
              resultJson = json;
              Navigator.of(ctx).pop(success);
            },
          ),
        ),
      ),
    );
    if (!mounted) return;

    if (ok != true) {
      if (ok == false) showError(context, 'Verification was not completed. Please try again.');
      return;
    }

    final jobId = smileJobId(resultJson);
    if (jobId != null) {
      try {
        await ref.read(apiClientProvider).attachKycJob(widget.kind, jobId);
      } catch (_) {
        // The capture still happened at the vendor; ops can resolve it from the
        // callback/review queue even if reporting the id from the app failed.
      }
    }
    if (!mounted) return;

    showInfo(context, 'Submitted — we’ll confirm your verification shortly.');
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _guidanceCard(),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _start,
            icon: const Icon(Icons.photo_camera_outlined),
            label: Text(widget.isFace ? 'Start face check' : 'Scan my ID'),
          ),
          const SizedBox(height: 12),
          const Text(
            'Capture runs on your device and goes straight to our verification '
            'partner — the photo never passes through Bobly Tide, and we never '
            'use images from your gallery.',
            style: TextStyle(color: BoblyColors.slate, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _guidanceCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(widget.isFace ? Icons.face_outlined : Icons.badge_outlined, color: BoblyColors.primary),
                const SizedBox(width: 8),
                Text(widget.isFace ? 'Liveness selfie' : 'Photograph your ID',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              ],
            ),
            const SizedBox(height: 10),
            ..._tips.map((t) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('•  ', style: TextStyle(color: BoblyColors.slate)),
                      Expanded(child: Text(t, style: const TextStyle(color: BoblyColors.slate, fontSize: 13))),
                    ],
                  ),
                )),
          ],
        ),
      ),
    );
  }
}
