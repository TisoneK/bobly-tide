import 'package:bobly_tide/models.dart';
import 'package:bobly_tide/widgets/format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('formatKes renders two decimals with the currency', () {
    expect(formatKes('22.8'), 'KES 22.80');
    expect(formatKes('0'), 'KES 0.00');
    expect(formatKes('-1'), 'KES -1.00');
  });

  test('GroupView.fromJson parses state, counts, your turn and members', () {
    final g = GroupView.fromJson({
      'id': 'g1',
      'state': 'active',
      'startAt': '2026-01-01T00:00:00Z',
      'size': 24,
      'joined': 24,
      'securedCount': 24,
      'yourPosition': 3,
      'yourSecured': true,
      'yourTurnAt': '2026-01-01T02:00:00Z',
      'yourBalance': '22.8',
      'members': [
        {'joinOrder': 1, 'turnPosition': 3, 'state': 'active', 'isYou': true},
        {'joinOrder': 2, 'turnPosition': null, 'state': 'active', 'isYou': false},
      ],
    });
    expect(g.isActive, true);
    expect(g.size, 24);
    expect(g.joined, 24);
    expect(g.securedCount, 24);
    expect(g.yourPosition, 3);
    expect(g.yourSecured, true);
    expect(g.yourTurnAt, '2026-01-01T02:00:00Z');
    expect(g.members.first.turnPosition, 3);
    expect(g.members.last.turnPosition, isNull);
  });

  test('GroupView.fromJson handles an unsecured member in a filling group', () {
    final g = GroupView.fromJson({
      'id': 'g1',
      'state': 'filling',
      'startAt': null,
      'size': 24,
      'joined': 1,
      'securedCount': 0,
      'yourPosition': null,
      'yourSecured': false,
      'yourTurnAt': null,
      'yourBalance': '0',
      'members': [
        {'joinOrder': 1, 'turnPosition': null, 'state': 'active', 'isYou': true},
      ],
    });
    expect(g.isFilling, true);
    expect(g.slotsRemaining, 23);
    expect(g.yourPosition, isNull);
    expect(g.yourSecured, false);
  });

  test('WalletView.fromJson parses available/held and entries', () {
    final w = WalletView.fromJson({
      'accountId': 'w1',
      'available': '22.8',
      'held': '1',
      'total': '23.8',
      'withdrawalMin': '50',
      'entries': [
        {'type': 'payout', 'amount': '22.8', 'groupId': 'g1', 'hourIndex': 0, 'at': '2026-01-01T00:00:00Z'},
      ],
    });
    expect(w.available, '22.8');
    expect(w.held, '1');
    expect(w.withdrawalMin, '50');
    expect(w.entries.single.type, 'payout');
    expect(w.entries.single.hourIndex, 0);
  });
}
