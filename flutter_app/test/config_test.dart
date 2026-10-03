import 'package:al_balag_poc/core/config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('normalizeBaseUrl adds a scheme and trims slashes', () {
    expect(normalizeBaseUrl('192.168.1.20:8000'), 'http://192.168.1.20:8000');
    expect(normalizeBaseUrl('  https://api.example.com/  '), 'https://api.example.com');
    expect(normalizeBaseUrl('http://10.0.2.2:8000//'), 'http://10.0.2.2:8000');
  });

  test('normalizeBaseUrl rejects junk', () {
    expect(normalizeBaseUrl(''), isNull);
    expect(normalizeBaseUrl('   '), isNull);
    expect(normalizeBaseUrl('ftp://host'), isNull);
    expect(normalizeBaseUrl('http://'), isNull);
  });
}
