import 'package:flutter/material.dart';

import 'admin_groups_screen.dart';
import 'admin_kyc_screen.dart';
import 'admin_security_screen.dart';

/// The ops console (admins only on the backend, AdminGuard). Two tabs: KYC
/// review and group/member oversight. A non-admin can open it but each tab
/// shows an "ops access only" state (the backend returns 403).
class OpsConsoleScreen extends StatelessWidget {
  const OpsConsoleScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Ops console'),
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: 'Verifications'),
              Tab(text: 'Groups'),
              Tab(text: 'Security'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            KycReviewTab(),
            GroupsTab(),
            SecurityTab(),
          ],
        ),
      ),
    );
  }
}
