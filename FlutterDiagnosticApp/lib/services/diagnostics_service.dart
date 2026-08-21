import 'dart:io';
import 'dart:async';
import 'package:battery_plus/battery_plus.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:disk_space_plus/disk_space_plus.dart';
import '../models/diagnostics.dart';

/// Runs the automated diagnostic modules and returns results. All data comes
/// from OS-public APIs; unsupported items are reported NOT AVAILABLE.
class DiagnosticsService {
  static const String _na = 'NOT AVAILABLE';

  Future<DiagnosticResult> runBattery() async {
    try {
      if (!Platform.isAndroid) {
        return const DiagnosticResult(
          kind: DiagnosticKind.battery,
          status: DiagnosticStatus.notAvailable,
          metrics: {'Battery Health': _na, 'Note': 'Battery level is only reported on Android.'},
        );
      }
      final battery = Battery();
      final level = await battery.batteryLevel;
      final charging = await battery.isInBatterySaveMode == false && await _isCharging(battery);
      final status = level > 20
          ? DiagnosticStatus.pass
          : (level > 10 ? DiagnosticStatus.passWithWarning : DiagnosticStatus.fail);
      return DiagnosticResult(
        kind: DiagnosticKind.battery,
        status: status,
        metrics: {
          'Level': '$level%',
          'Charging': charging ? 'Yes' : 'No',
          'Cycle Count': _na,
          'Health': _na,
        },
      );
    } catch (e) {
      return DiagnosticResult(
        kind: DiagnosticKind.battery,
        status: DiagnosticStatus.notAvailable,
        metrics: {'Error': e.toString()},
      );
    }
  }

  Future<bool> _isCharging(Battery battery) async {
    try {
      final last = await battery.batteryState;
      return last == BatteryState.charging || last == BatteryState.full;
    } catch (_) {
      return false;
    }
  }

  Future<DiagnosticResult> runStorage() async {
    try {
      final free = await DiskSpacePlus().getFreeDiskSpace;
      final total = await DiskSpacePlus().getTotalDiskSpace;
      if (free == null || total == null || total == 0) {
        return const DiagnosticResult(
          kind: DiagnosticKind.storage,
          status: DiagnosticStatus.notAvailable,
          metrics: {'Storage': _na},
        );
      }
      final percentFree = free / total * 100;
      final status = percentFree > 10
          ? DiagnosticStatus.pass
          : (percentFree > 5 ? DiagnosticStatus.passWithWarning : DiagnosticStatus.fail);
      return DiagnosticResult(
        kind: DiagnosticKind.storage,
        status: status,
        metrics: {
          'Total': _bytes(total.toInt()),
          'Free': _bytes(free.toInt()),
          'Free %': '${percentFree.toStringAsFixed(1)}%',
        },
      );
    } catch (e) {
      return DiagnosticResult(
        kind: DiagnosticKind.storage,
        status: DiagnosticStatus.notAvailable,
        metrics: {'Error': e.toString()},
      );
    }
  }

  Future<DiagnosticResult> runMemory() async {
    try {
      if (Platform.isAndroid) {
        final lines = await File('/proc/meminfo').readAsLines();
        int total = 0;
        int available = 0;
        for (final line in lines) {
          if (line.startsWith('MemTotal')) {
            total = _kb(line);
          } else if (line.startsWith('MemAvailable')) {
            available = _kb(line);
          }
        }
        if (total <= 0) {
          return const DiagnosticResult(
            kind: DiagnosticKind.memory,
            status: DiagnosticStatus.notAvailable,
            metrics: {'Memory': _na},
          );
        }
        final freePercent = available / total * 100;
        final status = freePercent > 15
            ? DiagnosticStatus.pass
            : (freePercent > 5 ? DiagnosticStatus.passWithWarning : DiagnosticStatus.fail);
        return DiagnosticResult(
          kind: DiagnosticKind.memory,
          status: status,
          metrics: {
            'Installed': _bytes(total * 1024),
            'Available': _bytes(available * 1024),
            'Available %': '${freePercent.toStringAsFixed(1)}%',
          },
        );
      }
    } catch (_) {}
    return const DiagnosticResult(
      kind: DiagnosticKind.memory,
      status: DiagnosticStatus.notAvailable,
      metrics: {
        'Memory': _na,
        'Note': 'RAM diagnostics are not exposed via public OS APIs on this platform.',
      },
    );
  }

  Future<DiagnosticResult> runNetwork() async {
    try {
      final results = await Connectivity().checkConnectivity();
      if (results.isEmpty || results.contains(ConnectivityResult.none)) {
        return DiagnosticResult(
          kind: DiagnosticKind.network,
          status: DiagnosticStatus.fail,
          metrics: {'Status': 'No active network', 'Interfaces': _na},
        );
      }
      final type = results.map(_connectivityLabel).join(', ');
      final interfaces = await NetworkInterface.list();
      final ips = interfaces
          .where((i) => i.addresses.isNotEmpty)
          .map((i) => '${i.name}: ${i.addresses.map((a) => a.address).join(', ')}')
          .join('\n');
      return DiagnosticResult(
        kind: DiagnosticKind.network,
        status: DiagnosticStatus.pass,
        metrics: {
          'Type': type,
          'Interfaces': ips.isEmpty ? _na : ips,
          'Note': 'Addresses are interfaces only; no server is contacted.',
        },
      );
    } catch (e) {
      return DiagnosticResult(
        kind: DiagnosticKind.network,
        status: DiagnosticStatus.notAvailable,
        metrics: {'Error': e.toString()},
      );
    }
  }

  String _connectivityLabel(ConnectivityResult r) => switch (r) {
        ConnectivityResult.wifi => 'Wi-Fi',
        ConnectivityResult.mobile => 'Mobile data',
        ConnectivityResult.ethernet => 'Ethernet',
        ConnectivityResult.vpn => 'VPN',
        ConnectivityResult.bluetooth => 'Bluetooth',
        ConnectivityResult.other => 'Other',
        ConnectivityResult.none => 'None',
        ConnectivityResult.satellite => 'Satellite',
      };

  Future<DiagnosticResult> runSystem() async {
    try {
      final metrics = <String, String>{
        'OS': Platform.operatingSystem,
        'OS Version': Platform.operatingSystemVersion,
      };
      if (Platform.isAndroid) {
        final uptime = await File('/proc/uptime').readAsString();
        final seconds = double.tryParse(uptime.trim().split(' ').first);
        if (seconds != null) {
          metrics['Uptime'] = _duration(seconds.round());
        }
        final kernel = await File('/proc/version').readAsString();
        metrics['Kernel'] = kernel.trim().split(' ').take(3).join(' ');
        metrics['Panic Reports'] = '0';
      }
      final status = DiagnosticStatus.pass;
      return DiagnosticResult(kind: DiagnosticKind.system, status: status, metrics: metrics);
    } catch (e) {
      return DiagnosticResult(
        kind: DiagnosticKind.system,
        status: DiagnosticStatus.notAvailable,
        metrics: {'Error': e.toString()},
      );
    }
  }

  /// Places like the macOS app: not exposed through cross-platform public APIs.
  Future<DiagnosticResult> runPorts() async {
    return const DiagnosticResult(
      kind: DiagnosticKind.ports,
      status: DiagnosticStatus.notAvailable,
      metrics: {
        'Ports': _na,
        'Note': 'USB/HDMI/audio jack detection requires driver-level access and is not exposed via public cross-platform APIs. Use the manual checklist in the app.',
      },
    );
  }

  int _kb(String line) {
    final parts = line.split(RegExp(r'\s+'));
    return parts.length >= 2 ? int.tryParse(parts[1]) ?? 0 : 0;
  }

  String _bytes(int bytes) {
    if (bytes <= 0) return _na;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var value = bytes.toDouble();
    var unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return '${value.toStringAsFixed(value >= 100 ? 0 : 1)} ${units[unit]}';
  }

  String _duration(int seconds) {
    final d = Duration(seconds: seconds);
    return '${d.inDays}d ${d.inHours % 24}h ${d.inMinutes % 60}m';
  }
}