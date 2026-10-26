/// Plain data models mirroring the backend JSON (see backend/README.md).

class Session {
  final String token;
  final String userId;
  const Session({required this.token, required this.userId});

  factory Session.fromJson(Map<String, dynamic> j) =>
      Session(token: j['token'] as String, userId: j['userId'] as String);
}

/// The membership created when a member joins a group.
class JoinResult {
  final String groupId;
  final String membershipId;
  final String walletId;
  final int joinOrder;
  const JoinResult({
    required this.groupId,
    required this.membershipId,
    required this.walletId,
    required this.joinOrder,
  });

  factory JoinResult.fromJson(Map<String, dynamic> j) => JoinResult(
        groupId: j['groupId'] as String,
        membershipId: j['membershipId'] as String,
        walletId: j['walletId'] as String,
        joinOrder: (j['joinOrder'] as num).toInt(),
      );
}

/// Outcome of leaving a filling group (POST /groups/:id/leave): the security
/// hold is released and any wallet balance refunded out.
class LeaveResult {
  final bool left;
  final String released;
  final String refunded;
  const LeaveResult({required this.left, required this.released, required this.refunded});

  factory LeaveResult.fromJson(Map<String, dynamic> j) => LeaveResult(
        left: j['left'] as bool? ?? true,
        released: j['released'].toString(),
        refunded: j['refunded'].toString(),
      );
}

/// A signed KYC vendor job (POST /verification/kyc/authorize). The on-device
/// Smile ID SDK uses this to upload the selfie/ID and run liveness straight to
/// the vendor; the backend resolves the result via its callback.
class KycUploadAuth {
  final String jobId;
  final String userId;
  final String kind;
  final String partnerId;
  final String timestamp;
  final String signature;
  final String callbackUrl;
  final String baseUrl;
  final String product; // e.g. 'biometric_kyc' | 'doc_verification'
  const KycUploadAuth({
    required this.jobId,
    required this.userId,
    required this.kind,
    required this.partnerId,
    required this.timestamp,
    required this.signature,
    required this.callbackUrl,
    required this.baseUrl,
    required this.product,
  });

  /// Smile ID's sandbox host carries "testapi"; anything else is production.
  bool get useSandbox => baseUrl.contains('testapi');

  factory KycUploadAuth.fromJson(Map<String, dynamic> j) => KycUploadAuth(
        jobId: j['jobId'] as String,
        userId: j['userId'] as String,
        kind: j['kind'] as String,
        partnerId: j['partnerId'] as String,
        timestamp: j['timestamp'] as String,
        signature: j['signature'] as String,
        callbackUrl: j['callbackUrl'] as String,
        baseUrl: j['baseUrl'] as String,
        product: j['product'] as String,
      );
}

/// A pending KYC submission in the ops review queue (GET /admin/verifications).
class PendingVerification {
  final String userId;
  final String phone;
  final String kind; // email | id | face | address
  final String? detail;
  final String updatedAt;
  const PendingVerification({
    required this.userId,
    required this.phone,
    required this.kind,
    required this.detail,
    required this.updatedAt,
  });

  factory PendingVerification.fromJson(Map<String, dynamic> j) => PendingVerification(
        userId: j['userId'] as String,
        phone: j['phone'] as String,
        kind: j['kind'] as String,
        detail: j['detail'] as String?,
        updatedAt: j['updatedAt'] as String,
      );
}

/// A security audit event in the ops console (GET /admin/security-events).
class SecurityEvent {
  final String id;
  final String type;
  final String severity; // info | warning | critical
  final String? phone;
  final String? ip;
  final String? detail;
  final String createdAt;
  const SecurityEvent({
    required this.id,
    required this.type,
    required this.severity,
    required this.phone,
    required this.ip,
    required this.detail,
    required this.createdAt,
  });

  factory SecurityEvent.fromJson(Map<String, dynamic> j) => SecurityEvent(
        id: j['id'] as String,
        type: j['type'] as String,
        severity: j['severity'] as String,
        phone: j['phone'] as String?,
        ip: j['ip'] as String?,
        detail: j['detail'] as String?,
        createdAt: j['createdAt'] as String,
      );
}

/// A group summary row in the ops console (GET /admin/groups).
class AdminGroupSummary {
  final String id;
  final String state;
  final int size;
  final int joined;
  final int secured;
  final String createdAt;
  final String? startAt;
  const AdminGroupSummary({
    required this.id,
    required this.state,
    required this.size,
    required this.joined,
    required this.secured,
    required this.createdAt,
    required this.startAt,
  });

  factory AdminGroupSummary.fromJson(Map<String, dynamic> j) => AdminGroupSummary(
        id: j['id'] as String,
        state: j['state'] as String,
        size: (j['size'] as num).toInt(),
        joined: (j['joined'] as num?)?.toInt() ?? 0,
        secured: (j['secured'] as num?)?.toInt() ?? 0,
        createdAt: j['createdAt'] as String,
        startAt: j['startAt'] as String?,
      );
}

/// A member row in the ops group-detail view — unmasked phone (admins only).
class AdminMember {
  final int joinOrder;
  final int? turnPosition;
  final String state;
  final String? name;
  final String phone;
  final bool secured;
  const AdminMember({
    required this.joinOrder,
    required this.turnPosition,
    required this.state,
    required this.name,
    required this.phone,
    required this.secured,
  });

  factory AdminMember.fromJson(Map<String, dynamic> j) => AdminMember(
        joinOrder: (j['joinOrder'] as num).toInt(),
        turnPosition: (j['turnPosition'] as num?)?.toInt(),
        state: j['state'] as String,
        name: j['name'] as String?,
        phone: j['phone'] as String,
        secured: j['secured'] as bool? ?? false,
      );
}

/// A group's detail in the ops console (GET /admin/groups/:id).
class AdminGroupDetail {
  final String id;
  final String state;
  final int size;
  final String? startAt;
  final int joined;
  final int secured;
  final List<AdminMember> members;
  const AdminGroupDetail({
    required this.id,
    required this.state,
    required this.size,
    required this.startAt,
    required this.joined,
    required this.secured,
    required this.members,
  });

  factory AdminGroupDetail.fromJson(Map<String, dynamic> j) => AdminGroupDetail(
        id: j['id'] as String,
        state: j['state'] as String,
        size: (j['size'] as num).toInt(),
        startAt: j['startAt'] as String?,
        joined: (j['joined'] as num?)?.toInt() ?? 0,
        secured: (j['secured'] as num?)?.toInt() ?? 0,
        members: ((j['members'] as List?) ?? const [])
            .map((m) => AdminMember.fromJson(m as Map<String, dynamic>))
            .toList(),
      );
}

/// The one pilot package (build spec §4 / backend DAILY_PACKAGE).
abstract final class DailyPackage {
  static const String name = 'Daily';
  static const int size = 24;
  static const int hourlyContribution = 1; // KES per hour
  static const double feePct = 0.05;
  static const String payout = '22.80'; // N × (1 − fee)
  static const String dailyCost = '24'; // KES per member per day
}

/// A member as shown in the group view — position and state only; other
/// members' balances are not exposed by the backend.
class GroupMemberView {
  final int joinOrder;
  final int? turnPosition; // null until secured
  final String state;
  final bool isYou;
  final String? name; // first name, optional
  final String? maskedPhone; // 2547••••678
  const GroupMemberView({
    required this.joinOrder,
    required this.turnPosition,
    required this.state,
    required this.isYou,
    required this.name,
    required this.maskedPhone,
  });

  /// What to show as the member's label: their name, else "You", else a number.
  String label() => isYou ? (name ?? 'You') : (name ?? 'Member $joinOrder');

  factory GroupMemberView.fromJson(Map<String, dynamic> j) => GroupMemberView(
        joinOrder: (j['joinOrder'] as num).toInt(),
        turnPosition: (j['turnPosition'] as num?)?.toInt(),
        state: j['state'] as String,
        isYou: j['isYou'] as bool? ?? false,
        name: j['name'] as String?,
        maskedPhone: j['maskedPhone'] as String?,
      );
}

class GroupView {
  final String id;
  final String state; // filling | active | completed | dissolved
  final String? startAt;
  final int size;
  final int joined;
  final int securedCount;
  final int? yourPosition; // turn position, null until secured
  final bool yourSecured;
  final String? yourTurnAt; // ISO time your turn begins (countdown target)
  final String? estimatedStartAt; // ISO rough estimate of activation (filling only)
  final String yourBalance;
  final List<GroupMemberView> members;
  const GroupView({
    required this.id,
    required this.state,
    required this.startAt,
    required this.size,
    required this.joined,
    required this.securedCount,
    required this.yourPosition,
    required this.yourSecured,
    required this.yourTurnAt,
    required this.estimatedStartAt,
    required this.yourBalance,
    required this.members,
  });

  int get slotsRemaining => size - joined;
  bool get isFilling => state == 'filling';
  bool get isActive => state == 'active';
  bool get isCompleted => state == 'completed';

  factory GroupView.fromJson(Map<String, dynamic> j) => GroupView(
        id: j['id'] as String,
        state: j['state'] as String,
        startAt: j['startAt'] as String?,
        size: (j['size'] as num).toInt(),
        joined: (j['joined'] as num?)?.toInt() ?? 0,
        securedCount: (j['securedCount'] as num?)?.toInt() ?? 0,
        yourPosition: (j['yourPosition'] as num?)?.toInt(),
        yourSecured: j['yourSecured'] as bool? ?? false,
        yourTurnAt: j['yourTurnAt'] as String?,
        estimatedStartAt: j['estimatedStartAt'] as String?,
        yourBalance: j['yourBalance'].toString(),
        members: ((j['members'] as List?) ?? const [])
            .map((m) => GroupMemberView.fromJson(m as Map<String, dynamic>))
            .toList(),
      );
}

/// A member's KYC status (GET /verification).
class VerificationStatus {
  final Map<String, String> items; // kind -> status
  final List<String> missing;
  final bool verified;
  const VerificationStatus({required this.items, required this.missing, required this.verified});

  factory VerificationStatus.fromJson(Map<String, dynamic> j) => VerificationStatus(
        items: ((j['items'] as Map?) ?? const {}).map((k, v) => MapEntry(k.toString(), v.toString())),
        missing: ((j['missing'] as List?) ?? const []).map((e) => e.toString()).toList(),
        verified: j['verified'] as bool? ?? false,
      );
}

class WalletEntry {
  final String type;
  final String amount;
  final String? groupId;
  final int? hourIndex;
  final String at;
  const WalletEntry({
    required this.type,
    required this.amount,
    required this.groupId,
    required this.hourIndex,
    required this.at,
  });

  factory WalletEntry.fromJson(Map<String, dynamic> j) => WalletEntry(
        type: j['type'] as String,
        amount: j['amount'].toString(),
        groupId: j['groupId'] as String?,
        hourIndex: (j['hourIndex'] as num?)?.toInt(),
        at: j['at'] as String,
      );
}

class WalletView {
  final String accountId;
  final String available; // spendable + withdrawable
  final String held; // locked security, returned as the cycle runs
  final String total;
  final String withdrawalMin;
  final List<WalletEntry> entries;
  const WalletView({
    required this.accountId,
    required this.available,
    required this.held,
    required this.total,
    required this.withdrawalMin,
    required this.entries,
  });

  factory WalletView.fromJson(Map<String, dynamic> j) => WalletView(
        accountId: j['accountId'] as String,
        available: j['available'].toString(),
        held: j['held'].toString(),
        total: j['total'].toString(),
        withdrawalMin: j['withdrawalMin'].toString(),
        entries: ((j['entries'] as List?) ?? const [])
            .map((e) => WalletEntry.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class TopupResult {
  final String txnId;
  final String checkoutRequestId;
  final String status;
  const TopupResult({
    required this.txnId,
    required this.checkoutRequestId,
    required this.status,
  });

  factory TopupResult.fromJson(Map<String, dynamic> j) => TopupResult(
        txnId: j['txnId'] as String,
        checkoutRequestId: j['checkoutRequestId'] as String,
        status: j['status'] as String,
      );
}
