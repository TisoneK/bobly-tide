import 'package:flutter/material.dart';

/// Bobly Tide brand palette — deep sea blue lead (build spec §9, ADR-3).
abstract final class BoblyColors {
  static const primary = Color(0xFF0B3D62); // deep sea blue
  static const primaryDark = Color(0xFF072A45);
  static const primaryLight = Color(0xFF1B5E8C);
  static const tide = Color(0xFF19B5C9); // secondary accent
  static const payout = Color(0xFFF5A623); // warm accent — your-turn / payout
  static const ink = Color(0xFF0F1724);
  static const slate = Color(0xFF475569);
  static const mist = Color(0xFFE2E8F0);
  static const paper = Color(0xFFF8FAFC);
  static const surface = Color(0xFFFFFFFF);
  static const success = Color(0xFF2E9E5B);
  static const warning = Color(0xFFE08700);
  static const danger = Color(0xFFD64545);
}

ThemeData boblyTheme() {
  const scheme = ColorScheme(
    brightness: Brightness.light,
    primary: BoblyColors.primary,
    onPrimary: Colors.white,
    secondary: BoblyColors.tide,
    onSecondary: Colors.white,
    tertiary: BoblyColors.payout,
    onTertiary: BoblyColors.ink,
    error: BoblyColors.danger,
    onError: Colors.white,
    surface: BoblyColors.surface,
    onSurface: BoblyColors.ink,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: BoblyColors.paper,
    appBarTheme: const AppBarTheme(
      backgroundColor: BoblyColors.primary,
      foregroundColor: Colors.white,
      centerTitle: true,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        backgroundColor: BoblyColors.primary,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      filled: true,
      fillColor: BoblyColors.surface,
    ),
    cardTheme: CardTheme(
      color: BoblyColors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: BoblyColors.mist),
      ),
    ),
  );
}
