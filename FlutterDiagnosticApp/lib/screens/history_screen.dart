import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../models/diagnostics.dart';
import '../services/store.dart';
import '../widgets/common.dart';

class HistoryScreen extends StatefulWidget {
  final AppStore store;
  const HistoryScreen({super.key, required this.store});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  late Future<List<DiagnosticSession>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.store.sessions();
  }

  void _reload() {
    setState(() => _future = widget.store.sessions());
  }

  Future<void> _export(DiagnosticSession s, String format) async {
    final base = await getDocumentsDirectoryPath();
    final dir = Directory('$base/exports');
    await dir.create(recursive: true);
    final stamp = s.createdAt.toIso8601String().replaceAll(':', '-').split('.').first;
    if (format == 'json') {
      final f = File('${dir.path}/session-$stamp.json');
      await f.writeAsString(const JsonEncoder.withIndent('  ').convert(s.toJson()));
      await Share.shareXFiles([XFile(f.path)], subject: 'Diagnostic session');
    } else if (format == 'csv') {
      final f = File('${dir.path}/session-$stamp.csv');
      final lines = <String>[];
      lines.add('ID,Technician,Date,Module,Status,Notes,Metric');
      for (final r in s.results) {
        final metrics = r.metrics.entries.map((e) => '${e.key}=${e.value}').join('; ');
        lines.add('${_csv(s.id)},${_csv(s.technician)},${s.createdAt.toIso8601String()},${_csv(r.kind.displayName)},${r.status.label},${_csv(r.notes)},${_csv(metrics)}');
      }
      await f.writeAsString(lines.join('\n'));
      await Share.shareXFiles([XFile(f.path)], subject: 'Diagnostic session CSV');
    }
  }

  Future<String> getDocumentsDirectoryPath() async {
    final d = await getApplicationDocumentsDirectory();
    return d.path;
  }

  String _csv(String v) => '"${v.replaceAll('"', '""')}"';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('History'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), tooltip: 'Reload', onPressed: _reload),
        ],
      ),
      body: FutureBuilder<List<DiagnosticSession>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final sessions = snap.data ?? const [];
          if (sessions.isEmpty) {
            return const Center(child: Text('No saved sessions yet.'));
          }
          return ListView.builder(
            itemCount: sessions.length,
            itemBuilder: (context, i) {
              final s = sessions[i];
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: ListTile(
                  leading: StatusBadge(status: s.overall),
                  title: Text('${s.technician} — ${s.createdAt.month}/${s.createdAt.day} ${s.createdAt.year}'),
                  subtitle: Text('${s.results.length} results · ${s.device['Model'] ?? s.device['Device Name'] ?? ''}'),
                  isThreeLine: false,
                  onTap: () => _showDetail(s),
                  trailing: PopupMenuButton<String>(
                    onSelected: (v) => _export(s, v),
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'json', child: Text('Export JSON')),
                      PopupMenuItem(value: 'csv', child: Text('Export CSV')),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  void _showDetail(DiagnosticSession s) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Session ${s.id.split('-').first}'),
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final e in s.device.entries)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 1),
                    child: Text('${e.key}: ${e.value}', style: const TextStyle(fontSize: 12)),
                  ),
                const Divider(),
                for (final r in s.results)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Expanded(child: Text(r.kind.displayName, style: const TextStyle(fontWeight: FontWeight.w600))),
                      StatusBadge(status: r.status, compact: true),
                    ]),
                  ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
        ],
      ),
    );
  }
}