import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models.dart';
import 'api_exception.dart';

/// Thin typed wrapper over the Bobly Tide backend. A new instance is created
/// whenever the session token changes (see state/providers.dart).
class ApiClient {
  final String baseUrl;
  final String? token;
  final http.Client _http;

  ApiClient({required this.baseUrl, this.token, http.Client? httpClient})
      : _http = httpClient ?? http.Client();

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  // --- auth (public) ---
  Future<void> requestOtp(String phone) => _post('/auth/otp/request', {'phone': phone});

  Future<Session> verifyOtp(String phone, String code) async =>
      Session.fromJson(await _post('/auth/otp/verify', {'phone': phone, 'code': code}));

  // --- verification (require a token) ---
  Future<VerificationStatus> verificationStatus() async =>
      VerificationStatus.fromJson(await _get('/verification'));

  Future<void> requestEmailCode(String email) => _post('/verification/email/request', {'email': email});

  Future<void> verifyEmailCode(String code) => _post('/verification/email/verify', {'code': code});

  Future<void> submitKyc(String kind, String reference) =>
      _post('/verification/submit', {'kind': kind, 'reference': reference});

  /// Authorize an on-device KYC capture (selfie/ID + liveness) with the vendor.
  /// Returns the signed job the Smile ID SDK runs; the backend resolves the
  /// result via its callback.
  Future<KycUploadAuth> authorizeKyc(String kind) async =>
      KycUploadAuth.fromJson(await _post('/verification/kyc/authorize', {'kind': kind}));

  Future<void> setProfile(String displayName) => _post('/auth/profile', {'displayName': displayName});

  // --- groups / wallets (require a token) ---
  /// Join the Daily package; the server allocates a filling group.
  Future<JoinResult> joinDaily() async =>
      JoinResult.fromJson(await _post('/packages/daily/join', const {}));

  /// Post your security to claim a turn (position is first-come-first-served).
  Future<void> secure(String groupId) => _post('/groups/$groupId/secure', const {});

  Future<GroupView> getGroup(String groupId) async => GroupView.fromJson(await _get('/groups/$groupId'));

  Future<WalletView> getWallet(String accountId) async =>
      WalletView.fromJson(await _get('/wallets/$accountId'));

  Future<TopupResult> topup(String walletId, int amount, String phone) async => TopupResult.fromJson(
        await _post('/wallets/$walletId/topup', {'amount': amount, 'phone': phone}),
      );

  Future<void> withdraw(String walletId, int amount, String phone) =>
      _post('/wallets/$walletId/withdraw', {'amount': amount, 'phone': phone});

  // --- cycle-end (require a token; only valid at the stated group state) ---
  /// Leave a group that is still filling; releases the hold and refunds out.
  Future<LeaveResult> leaveGroup(String groupId) async =>
      LeaveResult.fromJson(await _post('/groups/$groupId/leave', const {}));

  /// Renew after a completed cycle; the server allocates a fresh filling group.
  Future<JoinResult> renewGroup(String groupId) async =>
      JoinResult.fromJson(await _post('/groups/$groupId/renew', const {}));

  // --- ops / admin (require an admin token; non-admins get 403) ---
  /// KYC submissions awaiting an ops decision.
  Future<List<PendingVerification>> adminPendingVerifications() async {
    final list = await _getList('/admin/verifications');
    return list
        .map((e) => PendingVerification.fromJson(e as Map<String, dynamic>))
        .toList(growable: false);
  }

  /// Approve or reject one submission; [decision] is 'verified' or 'rejected'.
  Future<void> adminReview(String userId, String kind, String decision, {String? reason}) =>
      _post('/admin/verifications/$userId/review', {
        'kind': kind,
        'decision': decision,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      });

  /// Group summaries for ops oversight, newest first.
  Future<List<AdminGroupSummary>> adminListGroups({int limit = 50}) async {
    final list = await _getList('/admin/groups?limit=$limit');
    return list
        .map((e) => AdminGroupSummary.fromJson(e as Map<String, dynamic>))
        .toList(growable: false);
  }

  /// One group's members + states for ops oversight.
  Future<AdminGroupDetail> adminGroupDetail(String id) async =>
      AdminGroupDetail.fromJson(await _get('/admin/groups/$id'));

  /// The security audit trail (optionally filtered to [severity] and above).
  Future<List<SecurityEvent>> adminSecurityEvents({int limit = 100, String? severity}) async {
    final q = severity != null ? '?limit=$limit&severity=$severity' : '?limit=$limit';
    final list = await _getList('/admin/security-events$q');
    return list.map((e) => SecurityEvent.fromJson(e as Map<String, dynamic>)).toList(growable: false);
  }

  // --- plumbing ---
  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    final res = await _http.post(Uri.parse('$baseUrl$path'), headers: _headers, body: jsonEncode(body));
    return _decode(res);
  }

  Future<Map<String, dynamic>> _get(String path) async {
    final res = await _http.get(Uri.parse('$baseUrl$path'), headers: _headers);
    return _decode(res);
  }

  /// GET an endpoint that returns a JSON array (e.g. the admin review queue).
  Future<List<dynamic>> _getList(String path) async {
    final res = await _http.get(Uri.parse('$baseUrl$path'), headers: _headers);
    dynamic data;
    try {
      data = res.body.isEmpty ? const [] : jsonDecode(res.body);
    } catch (_) {
      data = const [];
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(res.statusCode, _message(data, res.statusCode));
    }
    return data is List ? data : const [];
  }

  Map<String, dynamic> _decode(http.Response res) {
    dynamic data;
    try {
      data = res.body.isEmpty ? <String, dynamic>{} : jsonDecode(res.body);
    } catch (_) {
      data = <String, dynamic>{};
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(res.statusCode, _message(data, res.statusCode));
    }
    return data is Map<String, dynamic> ? data : <String, dynamic>{};
  }

  /// Nest error bodies carry `message` as a string or a list of strings.
  String _message(dynamic data, int status) {
    if (data is Map && data['message'] != null) {
      final m = data['message'];
      return m is List ? m.join(', ') : m.toString();
    }
    return 'HTTP $status';
  }
}
