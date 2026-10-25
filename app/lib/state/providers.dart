import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../config.dart';
import '../models.dart';

/// The signed-in session (token + userId). In-memory only for the pilot —
/// persisting it to secure storage is a follow-up.
class SessionNotifier extends Notifier<Session?> {
  @override
  Session? build() => null;

  void set(Session s) => state = s;
  void clear() => state = null;
}

final sessionProvider = NotifierProvider<SessionNotifier, Session?>(SessionNotifier.new);

/// The phone the member signed in with (for prefilling M-Pesa top-up /
/// withdrawal). Set at OTP verify; not part of the token.
class SignedInPhoneNotifier extends Notifier<String?> {
  @override
  String? build() => null;
  void set(String phone) => state = phone;
  void clear() => state = null;
}

final signedInPhoneProvider =
    NotifierProvider<SignedInPhoneNotifier, String?>(SignedInPhoneNotifier.new);

/// Rebuilt whenever the token changes so requests carry the current session.
final apiClientProvider = Provider<ApiClient>((ref) {
  final session = ref.watch(sessionProvider);
  return ApiClient(baseUrl: apiBaseUrl, token: session?.token);
});

/// The group/membership this device joined. The backend has no "my groups"
/// endpoint yet, so the pilot client remembers it locally.
class Membership {
  final String groupId;
  final JoinResult join;
  const Membership(this.groupId, this.join);
}

class MembershipNotifier extends Notifier<Membership?> {
  @override
  Membership? build() => null;

  void set(Membership m) => state = m;
  void clear() => state = null;
}

final membershipProvider = NotifierProvider<MembershipNotifier, Membership?>(MembershipNotifier.new);
