import 'package:flutter/material.dart';
import 'package:smile_id/smile_id.dart';

import '../models.dart';

/// All Smile ID SDK usage is isolated in this one file, so the vendor API
/// touches a single, swappable seam.
///
/// NOTE: written to the published `smile_id` Flutter SDK API (the 10.x line).
/// The exact widget factory names, their parameters, and the onSuccess /
/// onError callback signatures must be reconciled against the version that
/// `flutter pub get` resolves on first compile — if a signature differs, the
/// fix is confined to this file. The SDK captures the selfie / document and
/// runs liveness on-device and uploads straight to Smile ID using the signed
/// [auth] job; our server never sees the images, and the result arrives via
/// the backend's /verification/callbacks/kyc endpoint.

typedef SmileDone = void Function(bool success, String? error);

/// Build the full-screen Smile ID capture flow for this KYC job.
Widget smileKycFlow({required KycUploadAuth auth, required SmileDone onDone}) {
  switch (auth.kind) {
    case 'face':
      // Selfie + liveness (SmartSelfie enrollment).
      return SmileID.smartSelfieEnrollment(
        userId: auth.userId,
        jobId: auth.jobId,
        showInstructions: true,
        showAttribution: true,
        allowAgentMode: false,
        onSuccess: (String? userId, String? jobId) => onDone(true, null),
        onError: (String error) => onDone(false, error),
      );
    case 'id':
    default:
      // Document authenticity + selfie-to-ID compare + liveness.
      return SmileID.documentVerification(
        userId: auth.userId,
        jobId: auth.jobId,
        countryCode: 'KE',
        showInstructions: true,
        showAttribution: true,
        onSuccess: (String? userId, String? jobId) => onDone(true, null),
        onError: (String error) => onDone(false, error),
      );
  }
}
