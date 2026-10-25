/// Backend base URL. Override at build/run time:
///   flutter run --dart-define=API_BASE_URL=https://api.example.com
///
/// The default suits an emulator talking to a dev server on the host; a real
/// Android device reaches the host as 10.0.2.2, an iOS simulator as localhost.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3000',
);
