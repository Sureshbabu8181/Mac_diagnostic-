import Foundation
import IOKit

/// Thin, safe access to the IOKit registry using public IOKit functions.
/// Reads only — never writes registry state.
enum IOKitSupport {
    /// Find a service by class matching, return the first matching io_object_t.
    @discardableResult
    static func firstService(matching cls: String) -> io_object_t? {
        let matching = IOServiceMatching(cls)
        guard let matching else { return nil }
        let service: io_object_t = IOServiceGetMatchingService(kIOMainPortDefault, matching)
        guard service != 0 else { return nil }
        return service
    }

    /// Read a property (by CFString name) from a service as an Int.
    static func intProperty(_ name: String, on service: io_object_t) -> Int? {
        guard let value = stringProperty(name, on: service) else { return nil }
        return Int(value)
    }

    /// Read a property as a raw String (works for CFNumber via description, CFString directly).
    static func stringProperty(_ name: String, on service: io_object_t) -> String? {
        guard let unmanaged = IORegistryEntryCreateCFProperty(service, name as CFString, kCFAllocatorDefault, 0) else {
            return nil
        }
        let cf: CFTypeRef = unmanaged.takeRetainedValue()
        if let str = cf as? String { return str }
        if let num = cf as? NSNumber { return num.stringValue }
        if let data = cf as? Data, !data.isEmpty { return data.count > 0 ? "data" : nil }
        return nil
    }

    /// Read a bool property.
    static func boolProperty(_ name: String, on service: io_object_t) -> Bool? {
        guard let unmanaged = IORegistryEntryCreateCFProperty(service, name as CFString, kCFAllocatorDefault, 0) else {
            return nil
        }
        let cf: CFTypeRef = unmanaged.takeRetainedValue()
        if let num = cf as? NSNumber { return num.boolValue }
        return nil
    }

    /// Enumerate all services matching a class, calling handler for each.
    static func forEachService(matching cls: String, handler: (io_object_t) -> Void) {
        let matching = IOServiceMatching(cls)
        guard let matching else { return }
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, matching, &iterator) == KERN_SUCCESS else { return }
        defer { IOObjectRelease(iterator) }
        while case let service = IOIteratorNext(iterator), service != 0 {
            handler(service)
            IOObjectRelease(service)
        }
    }
}

/// Wraps a service with lifecycle cleanup.
final class RegistryService {
    let object: io_object_t
    init?(_ object: io_object_t) {
        guard object != 0 else { return nil }
        self.object = object
    }
    deinit { IOObjectRelease(object) }
}