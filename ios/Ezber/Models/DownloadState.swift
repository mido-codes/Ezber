import Foundation

/// Offline-first: downloaded and not-downloaded state must be obvious.
enum DownloadState: String, Codable, CaseIterable {
    case notDownloaded
    case downloading
    case downloaded

    var label: String {
        switch self {
        case .notDownloaded: return "Not downloaded"
        case .downloading: return "Downloading"
        case .downloaded: return "Downloaded"
        }
    }

    var systemImage: String {
        switch self {
        case .notDownloaded: return "icloud.and.arrow.down"
        case .downloading: return "arrow.down.circle"
        case .downloaded: return "checkmark.circle.fill"
        }
    }
}

/// One reciter × surah download record.
struct Download: Identifiable, Hashable, Codable {
    var reciterID: String
    var surahID: Int
    var state: DownloadState
    var byteCount: Int?
    var updatedAt: Date?

    var id: String { "\(reciterID)-\(surahID)" }
}
