import Foundation

public struct TechnicianProfile: Codable, Identifiable, Sendable, Equatable {
    public let id: UUID
    public var name: String
    public var createdAt: Date

    public init(id: UUID = UUID(), name: String, createdAt: Date = Date()) {
        self.id = id
        self.name = name
        self.createdAt = createdAt
    }
}

public enum DiagnosticStoreError: LocalizedError {
    case unreadable
    case corrupt
    public var errorDescription: String? {
        switch self {
        case .unreadable: "Diagnostic history could not be read."
        case .corrupt: "Diagnostic history is corrupt and could not be decoded."
        }
    }
}

/// Local, offline, dependency-free history store backed by JSON files in a
/// per-application directory. Chosen for reliability and testability given the
/// build toolchain (no Xcode macro plugins). The API is intentionally small so
/// a SwiftData or SQLite implementation can replace it at packaging time
/// without touching the UI.
@MainActor
public final class DiagnosticStore {
    private let directory: URL
    private let sessionsFile: URL
    private let techniciansFile: URL
    private let lock = NSLock()

    public init(directory: URL? = nil) throws {
        let base = try directory ?? Self.defaultDirectory()
        self.directory = base
        self.sessionsFile = base.appendingPathComponent("sessions.json")
        self.techniciansFile = base.appendingPathComponent("technicians.json")
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
    }

    public init(inMemory: Bool = true) {
        let temp = FileManager.default.temporaryDirectory
            .appendingPathComponent("macdiagnostic-test-\(UUID().uuidString)")
        self.directory = temp
        self.sessionsFile = temp.appendingPathComponent("sessions.json")
        self.techniciansFile = temp.appendingPathComponent("technicians.json")
        try? FileManager.default.createDirectory(at: temp, withIntermediateDirectories: true)
    }

    private static func defaultDirectory() throws -> URL {
        let fm = FileManager.default
        let support = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return support.appendingPathComponent("MacDiagnosticApp", isDirectory: true)
    }

    // MARK: - Technicians

    @discardableResult
    public func addTechnician(named name: String) throws -> TechnicianProfile {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { throw DiagnosticStoreError.unreadable }
        var list = try loadTechnicians()
        if let existing = list.first(where: { $0.name.lowercased() == trimmed.lowercased() }) {
            return existing
        }
        let profile = TechnicianProfile(name: trimmed)
        list.append(profile)
        try write(list, to: techniciansFile)
        return profile
    }

    public func technicians() throws -> [TechnicianProfile] {
        try loadTechnicians()
    }

    public func deleteTechnician(named name: String) throws {
        var list = try loadTechnicians()
        list.removeAll { $0.name == name }
        try write(list, to: techniciansFile)
    }

    // MARK: - Sessions

    @discardableResult
    public func save(_ session: DiagnosticSession) throws -> DiagnosticSession {
        var list = try loadSessions()
        list.removeAll { $0.id == session.id }
        list.append(session)
        try write(list, to: sessionsFile)
        return session
    }

    public func sessions() throws -> [DiagnosticSession] {
        try loadSessions()
    }

    public func session(id: UUID) throws -> DiagnosticSession? {
        try loadSessions().first { $0.id == id }
    }

    public func delete(sessionID: UUID) throws {
        var list = try loadSessions()
        list.removeAll { $0.id == sessionID }
        try write(list, to: sessionsFile)
    }

    public func delete(_ session: DiagnosticSession) throws {
        try delete(sessionID: session.id)
    }

    public func clearAll() throws {
        try write([DiagnosticSession](), to: sessionsFile)
        try write([TechnicianProfile](), to: techniciansFile)
    }

    // MARK: - Persistence

    private func loadSessions() throws -> [DiagnosticSession] {
        lock.lock(); defer { lock.unlock() }
        guard FileManager.default.fileExists(atPath: sessionsFile.path) else { return [] }
        let data = try Data(contentsOf: sessionsFile)
        guard !data.isEmpty else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        do {
            return try decoder.decode([DiagnosticSession].self, from: data)
        } catch {
            throw DiagnosticStoreError.corrupt
        }
    }

    private func loadTechnicians() throws -> [TechnicianProfile] {
        lock.lock(); defer { lock.unlock() }
        guard FileManager.default.fileExists(atPath: techniciansFile.path) else { return [] }
        let data = try Data(contentsOf: techniciansFile)
        guard !data.isEmpty else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([TechnicianProfile].self, from: data)
    }

    private func write<T: Encodable>(_ value: T, to url: URL) throws {
        lock.lock(); defer { lock.unlock() }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(value)
        try data.write(to: url, options: [.atomic])
    }
}