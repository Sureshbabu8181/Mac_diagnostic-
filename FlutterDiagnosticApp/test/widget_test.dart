import 'package:flutter_test/flutter_test.dart';
import 'package:mac_diagnostic/models/diagnostics.dart';

void main() {
  test('diagnostic result serializes and deserializes', () {
    const result = DiagnosticResult(
      kind: DiagnosticKind.battery,
      status: DiagnosticStatus.pass,
      metrics: {'Level': '88%'},
      notes: 'Good.',
    );
    final json = result.toJson();
    final round = DiagnosticResult.fromJson(json);
    expect(round.kind, DiagnosticKind.battery);
    expect(round.status, DiagnosticStatus.pass);
    expect(round.metrics['Level'], '88%');
    expect(round.notes, 'Good.');
  });

  test('session overall verdict: fail dominates', () {
    final session = DiagnosticSession(
      id: '1',
      technician: 'T',
      createdAt: DateTime(2026),
      device: const {},
      results: [
        const DiagnosticResult(kind: DiagnosticKind.battery, status: DiagnosticStatus.pass),
        const DiagnosticResult(kind: DiagnosticKind.memory, status: DiagnosticStatus.fail),
      ],
    );
    expect(session.overall, DiagnosticStatus.fail);
  });

  test('manual kinds are flagged', () {
    final manual = DiagnosticKind.values.where((k) => k.isManual).toList();
    expect(manual, hasLength(6));
    expect(manual.every((k) => k.isManual), isTrue);
  });
}