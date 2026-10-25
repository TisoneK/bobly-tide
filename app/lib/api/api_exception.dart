/// An HTTP error from the backend, carrying the status and a readable message.
class ApiException implements Exception {
  final int status;
  final String message;
  const ApiException(this.status, this.message);

  bool get isUnauthorized => status == 401;

  @override
  String toString() => 'ApiException($status): $message';
}
