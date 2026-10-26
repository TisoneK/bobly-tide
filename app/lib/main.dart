import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:smile_id/smile_id.dart';

import 'app.dart';
import 'config.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Initialize the Smile ID KYC SDK once, up front (ADR-19). Per-job auth is
  // issued by the backend at /verification/kyc/authorize.
  SmileID.initialize(useSandbox: smileSandbox);
  runApp(const ProviderScope(child: BoblyApp()));
}
