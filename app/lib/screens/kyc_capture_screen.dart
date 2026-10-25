import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../state/providers.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// Live-camera KYC capture for the ID document and the face/selfie steps
/// (ADR-16: capture is always the device camera, never a gallery pick).
///
/// The pilot has no asset-upload pipeline or liveness vendor yet, so this
/// captures locally, shows a preview to confirm, and submits a *reference*
/// marking a live capture to the existing `/verification/submit` endpoint.
/// A real build streams the image/liveness result to a KYC provider; the
/// on-screen liveness prompt here is guidance, not detection.
class KycCaptureScreen extends ConsumerStatefulWidget {
  /// 'id' (document) or 'face' (selfie).
  final String kind;
  const KycCaptureScreen({super.key, required this.kind});

  bool get isFace => kind == 'face';

  @override
  ConsumerState<KycCaptureScreen> createState() => _KycCaptureScreenState();
}

class _KycCaptureScreenState extends ConsumerState<KycCaptureScreen> {
  final _picker = ImagePicker();
  XFile? _shot;
  bool _submitting = false;

  String get _title => widget.isFace ? 'Face check' : 'ID document';

  List<String> get _tips => widget.isFace
      ? const [
          'Hold the phone at eye level in good light.',
          'Fit your whole face in the frame — no hat or sunglasses.',
          'Look straight at the camera, then blink once.',
        ]
      : const [
          'Use your national ID or passport.',
          'Lay it flat on a dark surface and fill the frame.',
          'Keep it sharp and glare-free — all text readable.',
        ];

  Future<void> _capture() async {
    try {
      final shot = await _picker.pickImage(
        source: ImageSource.camera, // camera only — never gallery (ADR-16)
        preferredCameraDevice: widget.isFace ? CameraDevice.front : CameraDevice.rear,
        imageQuality: 85,
        maxWidth: 1600,
      );
      if (shot != null && mounted) setState(() => _shot = shot);
    } catch (e) {
      // Permission denied or no camera available on the device.
      if (mounted) showError(context, e);
    }
  }

  Future<void> _submit() async {
    final shot = _shot;
    if (shot == null) return;
    setState(() => _submitting = true);
    try {
      // No upload pipeline yet: send a reference that marks a genuine live
      // capture (filename + timestamp) so ops can see it was camera-sourced.
      final reference = 'camera:${widget.kind}:${shot.name}@${DateTime.now().toUtc().toIso8601String()}';
      await ref.read(apiClientProvider).submitKyc(widget.kind, reference);
      if (!mounted) return;
      showInfo(context, 'Submitted for review');
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
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
          _frame(),
          const SizedBox(height: 16),
          if (_shot == null)
            FilledButton.icon(
              onPressed: _submitting ? null : _capture,
              icon: const Icon(Icons.photo_camera_outlined),
              label: Text(widget.isFace ? 'Open camera for selfie' : 'Open camera'),
            )
          else ...[
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Looks good — submit'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _submitting ? null : _capture,
              icon: const Icon(Icons.refresh),
              label: const Text('Retake'),
            ),
          ],
          const SizedBox(height: 12),
          const Text(
            'Your capture goes to our team for review. We never pull photos from '
            'your gallery — only a fresh camera shot counts.',
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

  /// A framed preview — an oval guide for the face step, a card outline for ID.
  Widget _frame() {
    final shot = _shot;
    final border = widget.isFace ? null : BorderRadius.circular(12);
    final shape = widget.isFace ? BoxShape.circle : BoxShape.rectangle;
    return Center(
      child: Container(
        width: widget.isFace ? 220 : double.infinity,
        height: widget.isFace ? 220 : 210,
        decoration: BoxDecoration(
          color: BoblyColors.mist.withOpacity(0.4),
          shape: shape,
          borderRadius: border,
          border: Border.all(color: BoblyColors.mist, width: 2),
          image: shot != null
              ? DecorationImage(image: FileImage(File(shot.path)), fit: BoxFit.cover)
              : null,
        ),
        clipBehavior: Clip.antiAlias,
        child: shot != null
            ? null
            : Center(
                child: Icon(
                  widget.isFace ? Icons.face_retouching_natural_outlined : Icons.credit_card_outlined,
                  size: 56,
                  color: BoblyColors.slate,
                ),
              ),
      ),
    );
  }
}
