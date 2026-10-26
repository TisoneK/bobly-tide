import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:smile_id/smile_id_document_verification.dart';
import 'package:smile_id/smile_id_smart_selfie_enrollment.dart';

/// All Smile ID SDK usage is isolated in this one file, so the vendor API
/// touches a single, swappable seam.
///
/// Job ownership (ADR-25): the pinned `smile_id` 10.x capture *widgets* create
/// and submit the vendor job themselves — they cannot consume a job our server
/// signs (no partnerId/timestamp/signature parameters). So the SDK owns the
/// job, the app reports the returned job id to `POST /verification/kyc/attach`,
/// and the vendor's result callback resolves that `kyc_job` row. The backend
/// keeps its server-signed `authorizeUpload` path for a future server-submit
/// integration; the app does not use it.
///
/// The SDK captures the selfie / document and runs liveness on-device, then
/// uploads straight to Smile ID: our server never sees the images. The actual
/// capture needs the vendor's `smile_config.json` (Android assets) /
/// `SmileIDConfig.plist` (iOS) plus sandbox credentials, which are not in the
/// repo — without them the widgets fail at launch, so this layer is
/// compile-verified only until a device with credentials is available.

typedef SmileDone = void Function(bool success, String? error, String? resultJson);

/// The Smile ID capture widgets are Android/iOS only. Web and desktop builds
/// (dev previews) still compile the app, but KYC capture is unavailable there —
/// the vendor SDK has no implementation for those platforms, so calling into it
/// would throw a MissingPluginException at startup.
bool get smileKycSupported =>
    !kIsWeb &&
    (defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.iOS);

/// Extract the vendor job id from the SDK's success payload. The 10.x widgets
/// hand back a JSON string; the id is `job_id` (snake) or `jobId` (camel)
/// depending on the native bridge.
String? smileJobId(String? resultJson) {
  if (resultJson == null || resultJson.isEmpty) return null;
  try {
    final decoded = jsonDecode(resultJson);
    if (decoded is Map) {
      final id = decoded['job_id'] ?? decoded['jobId'];
      if (id is String && id.isNotEmpty) return id;
    }
  } on FormatException {
    return null;
  }
  return null;
}

/// Build the full-screen Smile ID capture flow for this KYC kind ('id' or
/// 'face').
Widget smileKycFlow({
  required String userId,
  required String kind,
  required SmileDone onDone,
}) {
  if (!smileKycSupported) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Text(
          'Identity capture runs in the Android or iOS app. '
          'This build is a desktop/web preview.',
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
  switch (kind) {
    case 'face':
      // Selfie + liveness (SmartSelfie enrollment).
      return SmileIDSmartSelfieEnrollment(
        userId: userId,
        showInstructions: true,
        showAttribution: true,
        allowAgentMode: false,
        onSuccess: (String result) => onDone(true, null, result),
        onError: (String error) => onDone(false, error, null),
      );
    case 'id':
    default:
      // Document authenticity + selfie-to-ID compare + liveness.
      return SmileIDDocumentVerification(
        userId: userId,
        countryCode: 'KE',
        showInstructions: true,
        showAttribution: true,
        onSuccess: (String result) => onDone(true, null, result),
        onError: (String error) => onDone(false, error, null),
      );
  }
}
