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

  // --- groups / wallets (require a token) ---
  /// Join the Daily package; the server allocates a filling group.
  Future<JoinResult> joinDaily() async =>
      JoinResult.fromJson(await _post('/packages/daily/join', const {}));

  Future<GroupView> getGroup(String groupId) async => GroupView.fromJson(await _get('/groups/$groupId'));

  Future<WalletView> getWallet(String accountId) async =>
      WalletView.fromJson(await _get('/wallets/$accountId'));

  Future<TopupResult> topup(String walletId, int amount, String phone) async => TopupResult.fromJson(
        await _post('/wallets/$walletId/topup', {'amount': amount, 'phone': phone}),
      );

  Future<void> withdraw(String walletId, int amount, String phone) =>
      _post('/wallets/$walletId/withdraw', {'amount': amount, 'phone': phone});

  // --- plumbing ---
  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async {
    final res = await _http.post(Uri.parse('$baseUrl$path'), headers: _headers, body: jsonEncode(body));
    return _decode(res);
  }

  Future<Map<String, dynamic>> _get(String path) async {
    final res = await _http.get(Uri.parse('$baseUrl$path'), headers: _headers);
    return _decode(res);
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
