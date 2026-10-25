import 'package:bobly_tide/phone.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('normalizes common Kenyan formats to canonical 254…', () {
    const canonical7 = '254712345678';
    expect(normalizePhone('+254712345678'), canonical7);
    expect(normalizePhone('254712345678'), canonical7);
    expect(normalizePhone('0712345678'), canonical7);
    expect(normalizePhone('712345678'), canonical7);
    expect(normalizePhone('+254 712 345 678'), canonical7);
    expect(normalizePhone('0712-345-678'), canonical7);
    expect(normalizePhone('00254712345678'), canonical7);
  });

  test('handles the 01 (2541) range', () {
    const canonical1 = '254112345678';
    expect(normalizePhone('0112345678'), canonical1);
    expect(normalizePhone('112345678'), canonical1);
    expect(normalizePhone('+254112345678'), canonical1);
  });

  test('rejects invalid numbers', () {
    expect(normalizePhone('12345'), isNull); // too short
    expect(normalizePhone('0812345678'), isNull); // 08 is not a mobile prefix
    expect(normalizePhone('254812345678'), isNull); // 2548 invalid
    expect(normalizePhone('abcd'), isNull);
  });

  test('resolvePhone combines the +254 picker with a local number', () {
    expect(resolvePhone('254', '0712345678'), '254712345678');
    expect(resolvePhone('254', '712345678'), '254712345678');
    expect(resolvePhone('254', '0112345678'), '254112345678');
    expect(resolvePhone('254', '+254712345678'), '254712345678'); // full pasted in
    expect(resolvePhone('254', ''), isNull);
  });
}
