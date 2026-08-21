import 'package:flutter/material.dart';
import '../models/diagnostics.dart';
import '../services/diagnostics_service.dart';
import '../services/store.dart';
import '../widgets/common.dart';
import '../widgets/manual_checks.dart';

/// Hosts a single test page. Automated tests run once and show their metrics;
/// manual tests show their interactive widget. All results are returned through
/// [onResult] and saved by the caller.
class TestScreen extends StatefulWidget {
  final DiagnosticKind kind;
  final AppStore store;
  final void Function(DiagnosticResult result) onResult;
  const TestScreen({super.key, required this.kind, required this.store, required this.onResult});

  @override
  State<TestScreen> createState() => _TestScreenState();
}

class _TestScreenState extends State<TestScreen> {
  final TextEditingController _notes = TextEditingController();
  final DiagnosticsService _service = DiagnosticsService();
  DiagnosticResult? _result;
  DiagnosticStatus? _choice;
  bool _running = false;

  bool get _manual => widget.kind.isManual;

  @override
  void initState() {
    super.initState();
    if (!_manual) _runAuto();
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _runAuto() async {
    setState(() { _running = true; });
    DiagnosticResult? r;
    switch (widget.kind) {
      case DiagnosticKind.battery: r = await _service.runBattery(); break;
      case DiagnosticKind.storage: r = await _service.runStorage(); break;
      case DiagnosticKind.memory: r = await _service.runMemory(); break;
      case DiagnosticKind.network: r = await _service.runNetwork(); break;
      case DiagnosticKind.system: r = await _service.runSystem(); break;
      case DiagnosticKind.ports: r = await _service.runPorts(); break;
      default: break;
    }
    if (mounted) setState(() { _result = r; _running = false; });
  }

  void _save() {
    final status = _manual
        ? (_choice ?? DiagnosticStatus.notTested)
        : (_choice ?? _result?.status ?? DiagnosticStatus.notTested);
    if (_manual && _choice == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose PASS, FAIL or SKIP before saving.')),
      );
      return;
    }
    final result = DiagnosticResult(
      kind: widget.kind,
      status: status,
      metrics: _manual ? const {} : (_result?.metrics ?? const {}),
      notes: _notes.text.trim(),
      timestampsAt: DateTime.now(),
    );
    widget.onResult(result);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${widget.kind.displayName}: ${status.label} recorded.')));
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final accent = widget.store.accentTestButtons;
    return Scaffold(
      appBar: AppBar(title: Text(widget.kind.displayName)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Center(
          child: Container(
            constraints: const BoxConstraints(maxWidth: 640),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(children: [Icon(widget.kind.icon), const SizedBox(width: 8),
                  Expanded(child: Text(widget.kind.whyItMatters, style: const TextStyle(fontSize: 13)))]),
                const SizedBox(height: 16),
                if (_manual)
                  ManualTestBody(kind: widget.kind, accent: accent, onVerdict: (s, _) {})
                else if (_running)
                  const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
                else if (_result != null) ...[
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                      StatusBadge(status: _result!.status),
                      OutlinedButton(onPressed: _runAuto, child: const Text('Re-run')),
                    ]),
                  ),
                  const SizedBox(height: 12),
                  MetricsGrid(metrics: _result!.metrics),
                ],
                const SizedBox(height: 20),
                VerdictBar(
                  accent: accent,
                  notes: _notes,
                  enabled: true,
                  onPass: () => setState(() => _choice = DiagnosticStatus.pass),
                  onFail: () => setState(() => _choice = DiagnosticStatus.fail),
                  onSkip: () => setState(() => _choice = DiagnosticStatus.skipped),
                ),
                if (_choice != null) ...[
                  const SizedBox(height: 6),
                  Text('Verdict selected: ${_choice!.label}', style: const TextStyle(fontWeight: FontWeight.w600)),
                ],
                const SizedBox(height: 14),
                FilledButton.icon(
                  onPressed: _save,
                  icon: const Icon(Icons.save_outlined),
                  label: const Text('Save Result & Back'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}