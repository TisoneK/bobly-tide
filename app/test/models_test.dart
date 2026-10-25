import 'package:bobly_tide/models.dart';
import 'package:bobly_tide/widgets/format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('formatKes renders two decimals with the currency', () {
    expect(formatKes('22.8'), 'KES 22.80');
    expect(formatKes('0'), 'KES 0.00');
    expect(formatKes('-1'), 'KES -1.00');
  });

  test('GroupView.fromJson parses state, size and members', () {
    final g = GroupView.fromJson({
      'id': 'g1',
      'state': 'filling',
      'startAt': null,
      'size': 24,
      'platform': '0',
      'members': [
        {'membershipId': 'm1', 'walletId': 'w1', 'joinOrder': 1, 'state': 'active', 'balance': '22.8'},
      ],
    });
    expect(g.isFilling, true);
    expect(g.size, 24);
    expect(g.filled, 1);
    expect(g.slotsRemaining, 23);
    expect(g.members.single.joinOrder, 1);
  });

  test('WalletView.fromJson parses balance and entries', () {
    final w = WalletView.fromJson({
      'accountId': 'w1',
      'balance': '22.8',
      'entries': [
        {'type': 'payout', 'amount': '22.8', 'groupId': 'g1', 'hourIndex': 0, 'at': '2026-01-01T00:00:00Z'},
      ],
    });
    expect(w.balance, '22.8');
    expect(w.entries.single.type, 'payout');
    expect(w.entries.single.hourIndex, 0);
  });
}
