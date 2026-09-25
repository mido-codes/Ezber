import Foundation

enum NoteKind: String, Codable, CaseIterable, Identifiable {
    case text
    case voiceMemo

    var id: String { rawValue }

    var label: String {
        switch self {
        case .text: return "Note"
        case .voiceMemo: return "Voice memo"
        }
    }

    var systemImage: String {
        switch self {
        case .text: return "text.alignleft"
        case .voiceMemo: return "mic"
        }
    }
}

/// A verse-scoped note. Voice memos captured while driving carry an audio file
/// and are transcribed later; `isTranscribed` tracks that pipeline state.
struct Note: Identifiable, Hashable, Codable {
    var id: UUID
    var verseID: VerseID
    var presetID: UUID?
    var body: String
    var kind: NoteKind
    var transcript: String?
    var isTranscribed: Bool
    var audioFileName: String?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        verseID: VerseID,
        presetID: UUID? = nil,
        body: String,
        kind: NoteKind = .text,
        transcript: String? = nil,
        isTranscribed: Bool = false,
        audioFileName: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.verseID = verseID
        self.presetID = presetID
        self.body = body
        self.kind = kind
        self.transcript = transcript
        self.isTranscribed = isTranscribed
        self.audioFileName = audioFileName
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var searchableText: String {
        [body, transcript ?? "", verseID.reference]
            .joined(separator: " ")
            .lowercased()
    }
}
