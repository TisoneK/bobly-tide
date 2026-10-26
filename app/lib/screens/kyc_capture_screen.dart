import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../kyc/smile_kyc.dart';
import '../models.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// On-device KYC capture for the ID document and face/selfie steps, run by the
/// Smile ID SDK (ADR-19, superseding the image_picker stand-in in ADR-17).
///
/// The flow: fetch a signed vendor job from the backend
/// (`POST /verification/kyc/authorize`), then hand it to the Smile ID SDK,
/// which captures the selfie/document and runs liveness on-device and uploads
/// straight to the vendor — the images never pass through our server. Smile ID
/// resolves the result asynchronously via the backend callback, so this screen
/// only has to launch the flow and report that it was submitted.
class KycCaptureScreen extends ConsumerStatefulWidget {
  /// 'id' (document) or 'face' (selfie).
  final String kind;
  const KycCaptureScreen({super.key, required this.kind});

  bool get isFace => kind == 'face';

  @override
  ConsumerState<KycCaptureScreen> createState() => _KycCaptureScreenState();
}

class _KycCaptureScreenState extends ConsumerState<KycCaptureScreen> {
  late Future<KycUploadAuth> _auth;

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

  @override
  void initState() {
    super.initState();
    _auth = ref.read(apiClientProvider).authorizeKyc(widget.kind);
  }

  void _retryAuth() {
    setState(() => _auth = ref.read(apiClientProvider).authorizeKyc(widget.kind));
  }

  /// Launch the Smile ID capture flow full-screen and act on its outcome.
  Future<void> _start(KycUploadAuth auth) async {
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (ctx) => Scaffold(
          appBar: AppBar(title: Text(_title)),
          body: smileKycFlow(
            auth: auth,
            onDone: (success, _) => Navigator.of(ctx).pop(success),
          ),
        ),
      ),
    );
    if (!mounted) return;
    if (ok == true) {
      showInfo(context, 'Submitted — we’ll confirm your verification shortly.');
      Navigator.of(context).pop(true);
    } else if (ok == false) {
      showError(context, 'Verification was not completed. Please try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_title)),
      body: FutureBuilder<KycUploadAuth>(
        future: _auth,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) return ErrorRetry(error: snap.error!, onRetry: _retryAuth);
          return _content(snap.data!);
        },
      ),
    );
  }

  Widget _content(KycUploadAuth auth) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _guidanceCard(),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: () => _start(auth),
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
