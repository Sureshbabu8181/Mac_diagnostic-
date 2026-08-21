import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/diagnostics.dart';

/// Persistent app state: settings (via SharedPreferences) and the diagnostic
/// session history (JSON files in the app documents directory). Fully offline.
class AppStore {
  late SharedPreferences prefs;
  bool _inited = false;

  static const keys = _Keys();

  Future<void> init() async {
    if (_inited) return;
    prefs = await SharedPreferences.getInstance();
    _inited = true;
  }

  // ---- Settings ----

  String get technician => prefs.getString(keys.technician) ?? 'Technician';
  set technician(String v) => prefs.setString(keys.technician, v);

  String get companyName => prefs.getString(keys.companyName) ?? '';
  set companyName(String v) => prefs.setString(keys.companyName, v);

  int get goodThreshold => prefs.getInt(keys.goodThreshold) ?? 80;
  set goodThreshold(int v) => prefs.setInt(keys.goodThreshold, v);

  int get fairThreshold => prefs.getInt(keys.fairThreshold) ?? 60;
  set fairThreshold(int v) => prefs.setInt(keys.fairThreshold, v);

  bool get accentTestButtons => prefs.getBool(keys.accentTestButtons) ?? true;
  set accentTestButtons(bool v) => prefs.setBool(keys.accentTestButtons, v);

  // ---- Sessions ----

  Future<Directory> _sessionsDir() async {
    final base = await getApplicationDocumentsDirectory();
    final dir = Directory('${base.path}/sessions');
    await dir.create(recursive: true);
    return dir;
  }

  Future<List<DiagnosticSession>> sessions() async {
    try {
      final dir = await _sessionsDir();
      final files = dir.listSync().whereType<File>().where((f) => f.path.endsWith('.json')).toList()
        ..sort((a, b) => (b.path).compareTo(a.path));
      final list = <DiagnosticSession>[];
      for (final f in files) {
        try {
          final json = jsonDecode(await f.readAsString()) as Map<String, Object?>;
          list.add(DiagnosticSession.fromJson(json));
        } catch (_) {}
      }
      return list;
    } catch (_) {
      return [];
    }
  }

  Future<void> saveSession(DiagnosticSession session) async {
    final dir = await _sessionsDir();
    final file = File('${dir.path}/${session.id}.json');
    await file.writeAsString(jsonEncode(session.toJson()));
  }

  Future<void> deleteAllSessions() async {
    final dir = await _sessionsDir();
    for (final f in dir.listSync()) {
      if (f is File) try { await f.delete(); } catch (_) {}
    }
  }

  /// A unique session id.
  static String newId() => '${DateTime.now().millisecondsSinceEpoch}-${Random().nextInt(0xFFFF)}';
}

class _Keys {
  const _Keys();
  final technician = 'technician';
  final companyName = 'company_name';
  final goodThreshold = 'good_threshold';
  final fairThreshold = 'fair_threshold';
  final accentTestButtons = 'accent_test_buttons';
}