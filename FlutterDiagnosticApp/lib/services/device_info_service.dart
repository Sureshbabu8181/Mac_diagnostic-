import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:device_info_plus/device_info_plus.dart';

/// Gathers identifying information about the current device using OS-provided
/// public APIs only. Anything not exposed is reported as "NOT AVAILABLE".
class DeviceInfoService {
  static const String na = 'NOT AVAILABLE';

  Future<Map<String, String>> collect() async {
    if (Platform.isAndroid) return collectAndroid();
    if (Platform.isWindows) return collectWindows();
    return {'Platform': kIsWeb ? 'Web' : Platform.operatingSystem, 'Detail': na};
  }

  Future<Map<String, String>> collectAndroid() async {
    final info = await DeviceInfoPlugin().androidInfo;
    return {
      'Device Name': info.model,
      'Brand': info.brand,
      'Model': '${info.manufacturer} ${info.model}'.trim(),
      'Android Version': info.version.release,
      'SDK': info.version.sdkInt.toString(),
      'Chipset / ABI': info.supportedAbis.join(', '),
      'Hardware': info.hardware,
      'Fingerprint': na,
      'Serial': na, // Not exposed via public APIs on modern Android
      'Host': na,
    };
  }

  Future<Map<String, String>> collectWindows() async {
    final info = await DeviceInfoPlugin().windowsInfo;
    return {
      'Device Name': info.computerName,
      'Host': info.computerName,
      'Windows Version': '${info.majorVersion}.${info.minorVersion}',
      'Build': info.buildNumber.toString(),
      'Edition': info.productName,
      'Architecture': Platform.operatingSystem == 'windows'
          ? (Platform.environment['PROCESSOR_ARCHITECTURE'] ?? na)
          : na,
      'Serial': na,
      'Model': na,
    };
  }
}