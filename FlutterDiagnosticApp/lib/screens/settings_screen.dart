import 'package:flutter/material.dart';
import '../services/store.dart';

class SettingsScreen extends StatefulWidget {
  final AppStore store;
  const SettingsScreen({super.key, required this.store});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _tech;
  late final TextEditingController _company;
  late int _good;
  late int _fair;
  late bool _accent;

  @override
  void initState() {
    super.initState();
    final s = widget.store;
    _tech = TextEditingController(text: s.technician);
    _company = TextEditingController(text: s.companyName);
    _good = s.goodThreshold;
    _fair = s.fairThreshold;
    _accent = s.accentTestButtons;
  }

  @override
  void dispose() {
    _tech.dispose();
    _company.dispose();
    super.dispose();
  }

  void _save() {
    final s = widget.store;
    s.technician = _tech.text.trim().isEmpty ? 'Technician' : _tech.text.trim();
    s.companyName = _company.text.trim();
    s.goodThreshold = _good;
    s.fairThreshold = _fair;
    s.accentTestButtons = _accent;
    setState(() {});
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Settings saved.')));
  }

  Future<void> _clearHistory() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Clear all history?'),
        content: const Text('All saved diagnostic sessions will be deleted. Reports already exported are not affected.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Clear')),
        ],
      ),
    );
    if (ok != true) return;
    await widget.store.deleteAllSessions();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('History cleared.')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _section('Technician', [
            TextField(controller: _tech, decoration: const InputDecoration(labelText: 'Technician name')),
          ]),
          _section('Company (report branding)', [
            TextField(controller: _company, decoration: const InputDecoration(labelText: 'Company name')),
          ]),
          _section('Battery thresholds', [
            Slider(value: _good.toDouble(), min: 51, max: 100, divisions: 49,
                label: 'GOOD at or above $_good%', onChanged: (v) => setState(() => _good = v.round())),
            Text('GOOD at or above: $_good%'),
            Slider(value: _fair.toDouble(), min: 0, max: 50, divisions: 50,
                label: 'FAIR at or above $_fair%', onChanged: (v) => setState(() => _fair = v.round())),
            Text('FAIR at or above: $_fair%. Below is POOR.'),
          ]),
          _section('Appearance', [
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Accent test-button backgrounds'),
              subtitle: const Text('Test-page buttons use the accent color when on; plain/white when off.'),
              value: _accent,
              onChanged: (v) => setState(() => _accent = v),
            ),
          ]),
          _section('Data', [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.delete_outline),
              title: const Text('Clear all local history'),
              subtitle: const Text('Deletes saved diagnostic sessions'),
              onTap: _clearHistory,
            ),
          ]),
          const SizedBox(height: 12),
          FilledButton.icon(onPressed: _save, icon: const Icon(Icons.save), label: const Text('Save Settings')),
          const SizedBox(height: 20),
          const Center(child: Text('MAC Diagnostic Center · offline · no data leaves this device', style: TextStyle(fontSize: 11))),
        ],
      ),
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [Text(title, style: const TextStyle(fontWeight: FontWeight.w700)), const SizedBox(height: 8), ...children],
        ),
      ),
    );
  }
}