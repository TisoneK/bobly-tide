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
  final String membershipId;
  final String walletId;
  final int joinOrder;
  const JoinResult({
    required this.membershipId,
    required this.walletId,
    required this.joinOrder,
  });

  factory JoinResult.fromJson(Map<String, dynamic> j) => JoinResult(
        membershipId: j['membershipId'] as String,
        walletId: j['walletId'] as String,
        joinOrder: (j['joinOrder'] as num).toInt(),
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

class GroupMember {
  final String membershipId;
  final String walletId;
  final int joinOrder;
  final String state;
  final String balance;
  const GroupMember({
    required this.membershipId,
    required this.walletId,
    required this.joinOrder,
    required this.state,
    required this.balance,
  });

  factory GroupMember.fromJson(Map<String, dynamic> j) => GroupMember(
        membershipId: j['membershipId'] as String,
        walletId: j['walletId'] as String,
        joinOrder: (j['joinOrder'] as num).toInt(),
        state: j['state'] as String,
        balance: j['balance'].toString(),
      );
}

class GroupView {
  final String id;
  final String state; // filling | active | completed | dissolved
  final String? startAt;
  final int size;
  final String platform;
  final List<GroupMember> members;
  const GroupView({
    required this.id,
    required this.state,
    required this.startAt,
    required this.size,
    required this.platform,
    required this.members,
  });

  int get filled => members.length;
  int get slotsRemaining => size - filled;
  bool get isFilling => state == 'filling';
  bool get isActive => state == 'active';

  factory GroupView.fromJson(Map<String, dynamic> j) => GroupView(
        id: j['id'] as String,
        state: j['state'] as String,
        startAt: j['startAt'] as String?,
        size: (j['size'] as num).toInt(),
        platform: j['platform'].toString(),
        members: ((j['members'] as List?) ?? const [])
            .map((m) => GroupMember.fromJson(m as Map<String, dynamic>))
            .toList(),
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
  final String balance;
  final List<WalletEntry> entries;
  const WalletView({
    required this.accountId,
    required this.balance,
    required this.entries,
  });

  factory WalletView.fromJson(Map<String, dynamic> j) => WalletView(
        accountId: j['accountId'] as String,
        balance: j['balance'].toString(),
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
