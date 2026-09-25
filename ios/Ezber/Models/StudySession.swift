import Foundation

/// Where the listener is in the verse × repetition queue. Saved at every repeat
/// boundary so the drill can always resume.
struct ResumePoint: Hashable, Codable {
    var verseNumber: Int
    var repeatIndex: Int

    init(verseNumber: Int, repeatIndex: Int) {
        self.verseNumber = verseNumber
        self.repeatIndex = max(1, repeatIndex)
    }
}

/// A run through a preset, with its resume point and completion counts.
struct StudySession: Identifiable, Hashable, Codable {
    var id: UUID
    var presetID: UUID
    var startedAt: Date
    var lastActiveAt: Date
    var resumePoint: ResumePoint
    var completedItems: Int
    var totalItems: Int
    var isCompleted: Bool

    init(
        id: UUID = UUID(),
        presetID: UUID,
        startedAt: Date = Date(),
        lastActiveAt: Date = Date(),
        resumePoint: ResumePoint,
        completedItems: Int = 0,
        totalItems: Int,
        isCompleted: Bool = false
    ) {
        self.id = id
        self.presetID = presetID
        self.startedAt = startedAt
        self.lastActiveAt = lastActiveAt
        self.resumePoint = resumePoint
        self.completedItems = completedItems
        self.totalItems = totalItems
        self.isCompleted = isCompleted
    }

    var completionRatio: Double {
        guard totalItems > 0 else { return 0 }
        return min(1, max(0, Double(completedItems) / Double(totalItems)))
    }
}
