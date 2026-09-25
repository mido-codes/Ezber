import Foundation

/// Per-verse memorization state. Honest exposure, not a score.
enum VerseState: String, Codable, CaseIterable, Identifiable {
    case new
    case learning
    case review
    case strong

    var id: String { rawValue }

    var label: String {
        switch self {
        case .new: return "New"
        case .learning: return "Learning"
        case .review: return "Review"
        case .strong: return "Strong"
        }
    }

    var explanation: String {
        switch self {
        case .new: return "Not drilled yet."
        case .learning: return "Fewer than 10 repetitions so far."
        case .review: return "10–29 repetitions; worth reviewing."
        case .strong: return "30 or more repetitions."
        }
    }

    /// Provisional thresholds. The shared schema/domain work may define its own
    /// mapping; keep this the only place iOS derives a state from counts.
    static func derived(fromRepetitions repetitions: Int) -> VerseState {
        switch repetitions {
        case ..<1: return .new
        case 1..<10: return .learning
        case 10..<30: return .review
        default: return .strong
        }
    }
}

/// Accumulated exposure for one verse across all presets and sessions.
struct VerseProgress: Identifiable, Hashable, Codable {
    var verseID: VerseID
    var repetitionsCompleted: Int
    var exposureCount: Int
    var lastPlayedAt: Date?
    var state: VerseState
    var lastPresetID: UUID?

    var id: VerseID { verseID }

    init(
        verseID: VerseID,
        repetitionsCompleted: Int = 0,
        exposureCount: Int = 0,
        lastPlayedAt: Date? = nil,
        state: VerseState = .new,
        lastPresetID: UUID? = nil
    ) {
        self.verseID = verseID
        self.repetitionsCompleted = repetitionsCompleted
        self.exposureCount = exposureCount
        self.lastPlayedAt = lastPlayedAt
        self.state = state
        self.lastPresetID = lastPresetID
    }
}
