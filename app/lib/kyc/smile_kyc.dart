import 'package:flutter/material.dart';
import 'package:smile_id/smile_id.dart';
import 'package:smile_id/smile_id_document_verification.dart';
import 'package:smile_id/smile_id_smart_selfie_enrollment.dart';

import '../models.dart';

/// All Smile ID SDK usage is isolated in this one file, so the vendor API
/// touches a single, swappable seam.
///
/// NOTE: reconciled against the `smile_id` 10.4.3 widget API (the line
/// `pubspec.yaml` pins). The SDK exposes full-screen capture *widgets* —
/// `SmileIDSmartSelfieEnrollment` / `SmileIDDocumentVerification` — whose
/// `onSuccess` / `onError` receive a JSON string, not the static factory
/// methods this file originally assumed. The SDK captures the selfie /
/// document and runs liveness on-device and uploads straight to Smile ID;
/// our server never sees the images, and the result arrives via the
/// backend's /verification/callbacks/kyc endpoint.
///
/// OPEN: this 10.x widget API takes `userId` (and `jobId` on document jobs)
/// but has no parameter for the server-signed job authorization our backend
/// issues (partnerId / timestamp / signature / product, ADR-19), so the SDK
/// currently creates its own job and the callback's job_id will not match the
/// `kyc_job` row we opened. Aligning the two needs either `extraPartnerParams`
/// + `skipApiSubmission` (server-issued jobs) or moving job ownership to the
/// SDK and mapping its returned jobId — decide with a device + sandbox
/// credentials before the KYC flow is called production-ready.

typedef SmileDone = void Function(bool success, String? error);

/// Build the full-screen Smile ID capture flow for this KYC job.
Widget smileKycFlow({required KycUploadAuth auth, required SmileDone onDone}) {
  switch (auth.kind) {
    case 'face':
      // Selfie + liveness (SmartSelfie enrollment).
      return SmileIDSmartSelfieEnrollment(
        userId: auth.userId,
        showInstructions: true,
        showAttribution: true,
        allowAgentMode: false,
        onSuccess: (String result) => onDone(true, null),
        onError: (String error) => onDone(false, error),
      );
    case 'id':
    default:
      // Document authenticity + selfie-to-ID compare + liveness.
      return SmileIDDocumentVerification(
        userId: auth.userId,
        jobId: auth.jobId,
        countryCode: 'KE',
        showInstructions: true,
        showAttribution: true,
        onSuccess: (String result) => onDone(true, null),
        onError: (String error) => onDone(false, error),
      );
  }
}
