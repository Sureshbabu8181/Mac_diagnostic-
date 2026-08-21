import 'package:flutter/material.dart';

/// The 12 diagnostic modules, mirroring the macOS app.
enum DiagnosticKind {
  battery,
  display,
  keyboard,
  trackpad,
  speakers,
  microphone,
  camera,
  ports,
  storage,
  memory,
  network,
  system;

  String get displayName => switch (this) {
        battery => 'Battery',
        display => 'Display',
        keyboard => 'Keyboard',
        trackpad => 'Trackpad',
        speakers => 'Speakers',
        microphone => 'Microphone',
        camera => 'Camera',
        ports => 'Ports & Connectivity',
        storage => 'Storage',
        memory => 'Memory',
        network => 'Network',
        system => 'System',
      };

  bool get isManual => switch (this) {
        display || keyboard || trackpad || speakers || microphone || camera => true,
        _ => false,
      };

  IconData get icon => switch (this) {
        battery => Icons.battery_full_rounded,
        display => Icons.monitor_rounded,
        keyboard => Icons.keyboard_rounded,
        trackpad => Icons.touch_app_rounded,
        speakers => Icons.volume_up_rounded,
        microphone => Icons.mic_rounded,
        camera => Icons.photo_camera_rounded,
        ports => Icons.usb_rounded,
        storage => Icons.storage_rounded,
        memory => Icons.memory_rounded,
        network => Icons.wifi_rounded,
        system => Icons.computer_rounded,
      };

  String get whyItMatters => switch (this) {
        battery =>
          'Verifies the battery level and charging state reported by the OS. Full battery health (cycle count) is not exposed through public OS APIs and is reported as NOT AVAILABLE.',
        display =>
          'Shows a set of full-screen test patterns (checkerboard, color bars, grey ramp) so you can check for dead pixels, banding and uniformity.',
        keyboard =>
          'Opens an on-screen key grid so you can press every physical key and confirm it registers. Uses the on-screen layout as a checklist.',
        trackpad =>
          'Helps verify tap-to-click, secondary click, scrolling and two-finger gestures are detected.',
        speakers =>
          'Plays a short synthesiser tone through left / right / stereo / mono channels so both speakers can be verified at a safe volume.',
        microphone =>
          'Records a short sample and plays it back. Used only during the test and deleted afterwards; nothing is uploaded.',
        camera =>
          'Opens the camera preview so you can verify live frames are delivered. No video is saved.',
        ports =>
          'Interactive checklist for USB-C / HDMI / audio jack ports and external accessories detected.',
        storage =>
          'Reports total and free space on the primary storage volume from the OS.',
        memory =>
          'Reports total and available memory. A full hardware RAM test requires manufacturer diagnostics.',
        network =>
          'Reports the active network type, interface and local IP addresses using OS information only.',
        system =>
          'Reports OS version, build, uptime and device identifiers as exposed by the OS.',
      };
}

/// Verdict states used across the app.
enum DiagnosticStatus {
  pass,
  passWithWarning,
  fail,
  skipped,
  notTested,
  notAvailable,
  inProgress;

  String get label => switch (this) {
        pass => 'PASS',
        passWithWarning => 'WARNING',
        fail => 'FAIL',
        skipped => 'SKIPPED',
        notTested => 'NOT TESTED',
        notAvailable => 'NOT AVAILABLE',
        inProgress => 'IN PROGRESS',
      };

  Color color(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return switch (this) {
      pass => const Color(0xFF2E7D32),
      passWithWarning => const Color(0xFFEF6C00),
      fail => const Color(0xFFC62828),
      skipped => Colors.blueGrey,
      notTested => Colors.grey,
      notAvailable => Colors.grey,
      inProgress => dark ? Colors.blueGrey.shade100 : Colors.blueGrey.shade700,
    };
  }
}

/// Result of one diagnostic module.
class DiagnosticResult {
  final DiagnosticKind kind;
  final DiagnosticStatus status;
  final Map<String, String> metrics;
  final String notes;
  final DateTime? timestampsAt;

  const DiagnosticResult({
    required this.kind,
    required this.status,
    this.metrics = const {},
    this.notes = '',
    this.timestampsAt,
  });

  Map<String, Object?> toJson() => {
        'kind': kind.name,
        'status': status.name,
        'metrics': metrics,
        'notes': notes,
        'timestampsAt': timestampsAt?.toIso8601String(),
      };

  factory DiagnosticResult.fromJson(Map<String, Object?> json) => DiagnosticResult(
        kind: DiagnosticKind.values.firstWhere(
          (k) => k.name == json['kind'],
          orElse: () => DiagnosticKind.system,
        ),
        status: DiagnosticStatus.values.firstWhere(
          (s) => s.name == json['status'],
          orElse: () => DiagnosticStatus.notTested,
        ),
        metrics: (json['metrics'] as Map?)?.map((k, v) => MapEntry(k.toString(), v.toString())) ?? const {},
        notes: (json['notes'] as String?) ?? '',
        timestampsAt: json['timestampsAt'] != null
            ? DateTime.tryParse(json['timestampsAt'] as String)
            : null,
      );
}

/// A completed diagnostic run for one technician/device.
class DiagnosticSession {
  final String id;
  final String technician;
  final DateTime createdAt;
  final Map<String, String> device;
  final List<DiagnosticResult> results;

  DiagnosticSession({
    required this.id,
    required this.technician,
    required this.createdAt,
    required this.device,
    required this.results,
  });

  Map<String, Object?> toJson() => {
        'id': id,
        'technician': technician,
        'createdAt': createdAt.toIso8601String(),
        'device': device,
        'results': results.map((r) => r.toJson()).toList(),
      };

  factory DiagnosticSession.fromJson(Map<String, Object?> json) => DiagnosticSession(
        id: (json['id'] as String?) ?? DateTime.now().millisecondsSinceEpoch.toString(),
        technician: (json['technician'] as String?) ?? 'Technician',
        createdAt: DateTime.tryParse((json['createdAt'] as String?) ?? '') ?? DateTime.now(),
        device: (json['device'] as Map?)?.map((k, v) => MapEntry(k.toString(), v.toString())) ?? const {},
        results: ((json['results'] as List?) ?? const [])
            .map((e) => DiagnosticResult.fromJson(Map<String, Object?>.from(e as Map)))
            .toList(),
      );

  DiagnosticStatus get overall {
    if (results.any((r) => r.status == DiagnosticStatus.fail)) return DiagnosticStatus.fail;
    if (results.any((r) => r.status == DiagnosticStatus.passWithWarning)) {
      return DiagnosticStatus.passWithWarning;
    }
    if (results.isEmpty || results.every((r) => r.status == DiagnosticStatus.notTested || r.status == DiagnosticStatus.notAvailable)) {
      return DiagnosticStatus.notTested;
    }
    return DiagnosticStatus.pass;
  }

  Map<DiagnosticStatus, int> get counts {
    final map = {for (final s in DiagnosticStatus.values) s: 0};
    for (final r in results) {
      map[r.status] = (map[r.status] ?? 0) + 1;
    }
    return map;
  }

  DiagnosticSession copyWith({List<DiagnosticResult>? results}) => DiagnosticSession(
        id: id,
        technician: technician,
        createdAt: createdAt,
        device: device,
        results: results ?? this.results,
      );
}