import Foundation
import IOKit
import CoreAudio

/// Port detection distinguishes AUTOMATED DETECTION (what's currently attached
/// via IORegistry/CoreAudio) from MANUAL PHYSICAL TEST (technician plugs a
/// known-good device). Software cannot prove an unoccupied port is electrically
/// functional, so any untouched port is reported MANUAL_REQUIRED.
public struct PortDiagnostic: AutomatedDiagnosticProvider {
    public let meta = DiagnosticMeta(
        kind: .ports,
        title: "Ports",
        whyItMatters: "Enumerates currently-connected USB-C/Thunderbolt, SD and audio devices. Unused ports require a technician physical test — software cannot verify their circuits.",
        isManual: false
    )

    public init() {}

    public func run() async -> DiagnosticResult {
        var metrics: [DiagnosticMetric] = []
        var detected: [String] = []
        var manualRequired: [String] = []

        // USB-C / Thunderbolt
        let usb = usbDevices()
        let thunderbolt = thunderboltDevices()
        let connectedCount = usb.count + thunderbolt.count
        metrics.append(DiagnosticMetric(name: "USB-C / Thunderbolt", value: connectedCount > 0 ? "\(connectedCount) device(s)" : "No device connected"))
        for device in (usb + thunderbolt).prefix(6) {
            metrics.append(DiagnosticMetric(name: "Connected", value: device))
        }
        if connectedCount > 0 {
            detected.append("USB-C / Thunderbolt")
        } else {
            manualRequired.append("USB-C / Thunderbolt")
        }

        // SD card via IORegistry media
        let sdCards = sdCards()
        metrics.append(DiagnosticMetric(name: "SD Card", value: sdCards.isEmpty ? "No SD card detected" : sdCards.joined(separator: ", ")))
        if sdCards.isEmpty {
            manualRequired.append("SD Card")
        } else {
            detected.append("SD Card")
        }

        // Audio output (headphone / adapter)
        let audioOutputs = audioOutputDevices()
        metrics.append(DiagnosticMetric(name: "Audio Output", value: audioOutputs.isEmpty ? "Internal only" : audioOutputs.joined(separator: ", ")))
        if audioOutputs.isEmpty {
            manualRequired.append("Headphone Jack")
        } else {
            detected.append("Audio Output")
        }

        // Display adapter
        let displays = displayOutputs()
        metrics.append(DiagnosticMetric(name: "Display Adapter", value: displays.isEmpty ? "Internal display only" : displays.joined(separator: ", ")))
        if displays.isEmpty {
            manualRequired.append("External Display")
        } else {
            detected.append("Display Adapter")
        }

        // MagSafe charging
        let magsafe = magSafeState()
        metrics.append(DiagnosticMetric(name: "MagSafe", value: magsafe))

        let status: DiagnosticStatus = detected.isEmpty ? .notAvailable : .manualRequired
        let summary: String
        if detected.isEmpty {
            summary = "No external devices detected. Manual physical verification of all ports is required."
        } else {
            summary = "Detected: \(detected.joined(separator: ", ")). Unused ports: \(manualRequired.joined(separator: ", ")) — manual physical test required."
        }

        return DiagnosticResult(kind: .ports, status: status, summary: summary, metrics: metrics)
    }

    // MARK: - Detection helpers

    func usbDevices() -> [String] {
        var names: [String] = []
        IOKitSupport.forEachService(matching: "IOUSBHostDevice") { service in
            if let name = IOKitSupport.stringProperty("USB Product Name", on: service) {
                names.append(name)
            }
        }
        return names
    }

    func thunderboltDevices() -> [String] {
        var names: [String] = []
        IOKitSupport.forEachService(matching: "AppleThunderboltNHIType") { service in
            if let name = IOKitSupport.stringProperty("name", on: service) {
                names.append(name)
            }
        }
        return names
    }

    func sdCards() -> [String] {
        var names: [String] = []
        IOKitSupport.forEachService(matching: "IOMedia") { service in
            guard IOKitSupport.boolProperty("Removable", on: service) == true else { return }
            if let name = IOKitSupport.stringProperty("BSD Name", on: service) {
                names.append(name)
            }
        }
        return names
    }

    func audioOutputDevices() -> [String] {
        var devices: [String] = []
        let systemID = AudioObjectID(kAudioObjectSystemObject)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var size = UInt32(0)
        guard AudioObjectGetPropertyDataSize(systemID, &address, 0, nil, &size) == noErr else { return [] }
        let count = Int(size) / MemoryLayout<AudioObjectID>.size
        guard count > 0 else { return [] }
        var ids = [AudioObjectID](repeating: 0, count: count)
        guard AudioObjectGetPropertyData(systemID, &address, 0, nil, &size, &ids) == noErr else { return [] }

        for id in ids {
            var nameAddress = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyDeviceNameCFString,
                mScope: kAudioObjectPropertyScopeOutput,
                mElement: kAudioObjectPropertyElementMain
            )
            var nameSize = UInt32(0)
            guard AudioObjectGetPropertyDataSize(id, &nameAddress, 0, nil, &nameSize) == noErr else { continue }
            var cfName: Unmanaged<CFString>?
            guard AudioObjectGetPropertyData(id, &nameAddress, 0, nil, &nameSize, &cfName) == noErr else { continue }
            if let name = cfName?.takeRetainedValue() as String? {
                devices.append(name)
            }
        }
        return devices
    }

    func displayOutputs() -> [String] {
        var names: [String] = []
        IOKitSupport.forEachService(matching: "IODisplayConnect") { service in
            if let name = IOKitSupport.stringProperty("IODisplayLocation", on: service) {
                names.append(name)
            }
        }
        return names
    }

    func magSafeState() -> String {
        guard let service = IOKitSupport.firstService(matching: "AppleSmartBattery") else { return "NOT AVAILABLE" }
        defer { IOObjectRelease(service) }
        if let external = IOKitSupport.boolProperty("ExternalConnected", on: service), external {
            return "Charging"
        }
        return "Not charging"
    }
}