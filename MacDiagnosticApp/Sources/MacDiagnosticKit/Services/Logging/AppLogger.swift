import Foundation
import OSLog

/// Structured, privacy-safe logger. Never accept passwords, typed content,
/// audio/camera payloads or credentials as message text.
public final class AppLogger: @unchecked Sendable {
    private let logger: os.Logger

    public init(subsystem: String = "com.macdiagnostic.app", category: String = "diagnostics") {
        logger = os.Logger(subsystem: subsystem, category: category)
    }

    public func debug(_ message: String) {
        logger.debug("\(message, privacy: .private)")
    }

    public func info(_ message: String) {
        logger.info("\(message, privacy: .private)")
    }

    public func warning(_ message: String) {
        logger.warning("\(message, privacy: .private)")
    }

    public func error(_ message: String) {
        logger.error("\(message, privacy: .private)")
    }

    public static let shared = AppLogger()

    /// Export the current process log to a file. Uses `log show` for the
    /// app's subsystem/category only — nothing private.
    public static func exportLogs(to url: URL, subsystem: String = "com.macdiagnostic.app") throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/log")
        process.arguments = ["show", "--last", "1d", "--predicate", "subsystem == \"\(subsystem)\"", "--style", "compact"]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()
        try process.run()
        process.waitUntilExit()

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        try data.write(to: url)
    }
}