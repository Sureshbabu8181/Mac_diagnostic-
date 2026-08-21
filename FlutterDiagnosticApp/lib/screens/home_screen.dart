import 'package:flutter/material.dart';
import '../models/diagnostics.dart';
import '../services/device_info_service.dart';
import '../services/diagnostics_service.dart';
import '../services/store.dart';
import '../widgets/common.dart';
import 'test_screen.dart';
import 'history_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  final AppStore store;
  const HomeScreen({super.key, required this.store});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final DiagnosticsService _service = DiagnosticsService();
  Map<String, String> _device = const {};
  DiagnosticSession? _session;
  bool _busy = false;
  String _step = '';

  @override
  void initState() {
    super.initState();
    _setup();
  }

  Future<void> _setup() async {
    setState(() => _busy = true);
    final device = await DeviceInfoService().collect();
    if (!mounted) return;
    setState(() {
      _device = device;
      _session = DiagnosticSession(
        id: AppStore.newId(),
        technician: widget.store.technician,
        createdAt: DateTime.now(),
        device: device,
        results: DiagnosticKind.values.map((k) => DiagnosticResult(kind: k, status: DiagnosticStatus.notTested)).toList(),
      );
      _busy = false;
    });
  }

  DiagnosticStatus? _statusFor(DiagnosticKind kind) {
    final s = _session;
    if (s == null) return null;
    for (final r in s.results) {
      if (r.kind == kind) return r.status;
    }
    return null;
  }

  void _adopt(DiagnosticResult result) {
    final session = _session;
    if (session == null) return;
    final updated = session.copyWith(results: [
      for (final r in session.results) r.kind == result.kind ? result : r,
    ]);
    setState(() => _session = updated);
    widget.store.saveSession(updated);
  }

  Future<DiagnosticResult> _runAutomated(DiagnosticKind kind) async {
    switch (kind) {
      case DiagnosticKind.battery: return _service.runBattery();
      case DiagnosticKind.storage: return _service.runStorage();
      case DiagnosticKind.memory: return _service.runMemory();
      case DiagnosticKind.network: return _service.runNetwork();
      case DiagnosticKind.system: return _service.runSystem();
      case DiagnosticKind.ports: return _service.runPorts();
      default: return DiagnosticResult(kind: kind, status: DiagnosticStatus.notTested);
    }
  }

  Future<void> _runAll() async {
    final session = _session;
    if (session == null) return;
    setState(() {});
    for (final kind in DiagnosticKind.values.where((k) => !k.isManual)) {
      setState(() => _step = 'Running ${kind.displayName}…');
      final result = await _runAutomated(kind);
      _adopt(result);
    }
    if (mounted) setState(() => _step = 'Automated tests complete. Manual tests run from their cards.');
  }

  Future<void> _open(DiagnosticKind kind) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => TestScreen(kind: kind, store: widget.store, onResult: _adopt),
    ));
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final session = _session;
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('MAC Diagnostic Center'),
        actions: [
          IconButton(icon: const Icon(Icons.history), tooltip: 'History',
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => HistoryScreen(store: widget.store)))),
          IconButton(icon: const Icon(Icons.settings), tooltip: 'Settings',
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => SettingsScreen(store: widget.store)))),
        ],
      ),
      body: _busy || session == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _setup,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  DevicePanel(device: _device, session: session),
                  const SizedBox(height: 16),
                  CountsStrip(session: session),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _step.startsWith('Running') ? null : _runAll,
                    icon: _step.startsWith('Running')
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.play_arrow),
                    label: Text(_step.startsWith('Running') ? 'Testing…' : 'RUN TESTS'),
                  ),
                  const SizedBox(height: 6),
                  Text(_step, style: theme.textTheme.bodySmall),
                  const SizedBox(height: 10),
                  ...DiagnosticKind.values.map((k) => ModuleTile(
                        kind: k,
                        status: _statusFor(k),
                        onTap: () => _open(k),
                      )),
                ],
              ),
            ),
    );
  }
}

class DevicePanel extends StatelessWidget {
  final Map<String, String> device;
  final DiagnosticSession session;
  const DevicePanel({super.key, required this.device, required this.session});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Device Information', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          for (final e in device.entries)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 160, child: Text(e.key, style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600))),
                  Expanded(child: Text(e.value, style: theme.textTheme.bodySmall)),
                ],
              ),
            ),
          const Divider(height: 20),
          Row(children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Technician', style: TextStyle(fontSize: 10)),
              Text(session.technician, style: const TextStyle(fontWeight: FontWeight.w600)),
            ]),
            const SizedBox(width: 24),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Date', style: TextStyle(fontSize: 10)),
              Text('${session.createdAt.month}/${session.createdAt.day} ${session.createdAt.year}',
                  style: const TextStyle(fontWeight: FontWeight.w600)),
            ]),
          ]),
        ],
      ),
    );
  }
}

class CountsStrip extends StatelessWidget {
  final DiagnosticSession session;
  const CountsStrip({super.key, required this.session});

  @override
  Widget build(BuildContext context) {
    final counts = session.counts;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _item(counts[DiagnosticStatus.pass]!, 'PASS', const Color(0xFF2E7D32)),
          _item(counts[DiagnosticStatus.passWithWarning]!, 'WARN', const Color(0xFFEF6C00)),
          _item(counts[DiagnosticStatus.fail]!, 'FAIL', const Color(0xFFC62828)),
          _item(counts[DiagnosticStatus.notTested]!, 'NOT TESTED', Colors.grey),
          _item(counts[DiagnosticStatus.notAvailable]!, 'N/A', Colors.grey),
        ],
      ),
    );
  }

  Widget _item(int count, String label, Color color) {
    return Column(children: [
      Text('$count', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: color)),
      Text(label, style: const TextStyle(fontSize: 10)),
    ]);
  }
}