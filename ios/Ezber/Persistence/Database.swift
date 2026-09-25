import Foundation
import SQLite3

/// Tells SQLite to copy bound values. Swift's default string pointer would
/// otherwise be SQLITE_STATIC and could dangle after the call returns.
private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

enum DatabaseError: Error, LocalizedError {
    case openFailed(path: String, message: String)
    case prepareFailed(sql: String, message: String)
    case stepFailed(sql: String, message: String)
    case bindFailed(index: Int32, message: String)
    case notOpen

    var errorDescription: String? {
        switch self {
        case .openFailed(let path, let message):
            return "Could not open database at \(path): \(message)"
        case .prepareFailed(let sql, let message):
            return "Could not prepare SQL (\(sql)): \(message)"
        case .stepFailed(let sql, let message):
            return "SQL failed (\(sql)): \(message)"
        case .bindFailed(let index, let message):
            return "Could not bind parameter \(index): \(message)"
        case .notOpen:
            return "Database is not open."
        }
    }
}

/// A value that can be bound to a prepared statement.
enum SQLiteValue {
    case null
    case integer(Int)
    case real(Double)
    case text(String)
    case blob(Data)
}

/// A thin, deliberately small wrapper over the system SQLite library. The
/// content and user stores each own one `Database`.
final class Database {
    private(set) var handle: OpaquePointer?
    let path: String

    init(path: String, flags: Int32 = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX) throws {
        self.path = path
        var database: OpaquePointer?
        let result = sqlite3_open_v2(path, &database, flags, nil)
        guard result == SQLITE_OK, let opened = database else {
            let message = database.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown error"
            if let database {
                sqlite3_close(database)
            }
            throw DatabaseError.openFailed(path: path, message: message)
        }
        self.handle = opened
        try execute("PRAGMA foreign_keys = ON;")
    }

    deinit {
        if let handle {
            sqlite3_close(handle)
        }
    }

    @discardableResult
    func execute(_ sql: String) throws -> Int {
        guard let handle else { throw DatabaseError.notOpen }
        var errorPointer: UnsafeMutablePointer<CChar>?
        let result = sqlite3_exec(handle, sql, nil, nil, &errorPointer)
        if result != SQLITE_OK {
            let message = errorPointer.map { String(cString: $0) } ?? String(cString: sqlite3_errmsg(handle))
            sqlite3_free(errorPointer)
            throw DatabaseError.stepFailed(sql: sql, message: message)
        }
        return Int(sqlite3_changes(handle))
    }

    func execute(_ sql: String, _ bindings: [SQLiteValue]) throws {
        let statement = try prepare(sql)
        try statement.bind(bindings)
        while try statement.step() {}
    }

    func prepare(_ sql: String) throws -> Statement {
        guard let handle else { throw DatabaseError.notOpen }
        var statement: OpaquePointer?
        let result = sqlite3_prepare_v2(handle, sql, -1, &statement, nil)
        guard result == SQLITE_OK, let prepared = statement else {
            throw DatabaseError.prepareFailed(sql: sql, message: String(cString: sqlite3_errmsg(handle)))
        }
        return Statement(handle: prepared, sql: sql)
    }

    func query<T>(_ sql: String, _ bindings: [SQLiteValue] = [], row: (Statement) throws -> T) throws -> [T] {
        let statement = try prepare(sql)
        try statement.bind(bindings)
        var results: [T] = []
        while try statement.step() {
            results.append(try row(statement))
        }
        return results
    }

    func transaction(_ body: () throws -> Void) throws {
        try execute("BEGIN IMMEDIATE;")
        do {
            try body()
            try execute("COMMIT;")
        } catch {
            try? execute("ROLLBACK;")
            throw error
        }
    }
}

/// A prepared SQL statement. Bind, then step through rows.
final class Statement {
    private let handle: OpaquePointer
    private let sql: String

    init(handle: OpaquePointer, sql: String) {
        self.handle = handle
        self.sql = sql
    }

    deinit {
        sqlite3_finalize(handle)
    }

    func bind(_ values: [SQLiteValue]) throws {
        sqlite3_reset(handle)
        sqlite3_clear_bindings(handle)
        for (offset, value) in values.enumerated() {
            let index = Int32(offset + 1)
            let result: Int32
            switch value {
            case .null:
                result = sqlite3_bind_null(handle, index)
            case .integer(let integer):
                result = sqlite3_bind_int64(handle, index, Int64(integer))
            case .real(let double):
                result = sqlite3_bind_double(handle, index, double)
            case .text(let string):
                result = sqlite3_bind_text(handle, index, string, -1, sqliteTransient)
            case .blob(let data):
                result = data.withUnsafeBytes { buffer in
                    sqlite3_bind_blob(handle, index, buffer.baseAddress, Int32(buffer.count), sqliteTransient)
                }
            }
            guard result == SQLITE_OK else {
                throw DatabaseError.bindFailed(
                    index: index,
                    message: String(cString: sqlite3_errmsg(sqlite3_db_handle(handle)))
                )
            }
        }
    }

    /// Returns true when a row is available, false when the statement is done.
    func step() throws -> Bool {
        let result = sqlite3_step(handle)
        switch result {
        case SQLITE_ROW:
            return true
        case SQLITE_DONE:
            return false
        default:
            throw DatabaseError.stepFailed(
                sql: sql,
                message: String(cString: sqlite3_errmsg(sqlite3_db_handle(handle)))
            )
        }
    }

    func isNull(at index: Int32) -> Bool {
        sqlite3_column_type(handle, index) == SQLITE_NULL
    }

    func string(at index: Int32) -> String? {
        sqlite3_column_text(handle, index).map { String(cString: $0) }
    }

    func int(at index: Int32) -> Int {
        Int(sqlite3_column_int64(handle, index))
    }

    func double(at index: Int32) -> Double {
        sqlite3_column_double(handle, index)
    }

    func data(at index: Int32) -> Data? {
        guard let pointer = sqlite3_column_blob(handle, index) else { return nil }
        let count = Int(sqlite3_column_bytes(handle, index))
        return Data(bytes: pointer, count: count)
    }
}
