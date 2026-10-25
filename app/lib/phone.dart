/// Canonical Kenyan M-Pesa MSISDN: 254 + (7|1) + 8 digits. Safaricom numbers
/// start 07… or 01…, i.e. 2547… or 2541… in international form.
final _canonicalRe = RegExp(r'^254(7|1)\d{8}$');

/// Normalise any common input to canonical form, or null if it isn't a valid
/// Kenyan mobile number. Accepts, e.g.:
///   +254712345678, 254712345678, 0712345678, 0112345678,
///   712345678, 112345678, and spaced/dashed variants.
String? normalizePhone(String input) {
  var d = input.replaceAll(RegExp(r'[^0-9]'), ''); // drop +, spaces, dashes
  if (d.startsWith('00')) d = d.substring(2); // 00254… → 254…
  if (d.startsWith('254')) {
    // already country-coded
  } else if (d.startsWith('0')) {
    d = '254${d.substring(1)}'; // 07.. / 01.. → 2547.. / 2541..
  } else if (d.length == 9 && (d.startsWith('7') || d.startsWith('1'))) {
    d = '254$d'; // 7.. / 1.. → 254..
  }
  return _canonicalRe.hasMatch(d) ? d : null;
}
