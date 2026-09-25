import Foundation

struct VoiceMemo: Hashable {
    let url: URL
    let duration: TimeInterval
    let createdAt: Date
}

/// Interface for verse voice memos (recorded while driving, transcribed later).
/// This slice ships only a stub; no microphone is used.
protocol VoiceMemoService: AnyObject {
    var isRecording: Bool { get }
    func startRecording() throws
    func stopRecording() throws -> VoiceMemo?
}

/// Records nothing. Returns a placeholder memo so the notes flow stays
/// clickable; the real implementation will write audio files and queue
/// transcription.
final class StubVoiceMemoService: VoiceMemoService {
    private(set) var isRecording = false

    func startRecording() throws {
        isRecording = true
    }

    func stopRecording() throws -> VoiceMemo? {
        isRecording = false
        return VoiceMemo(
            url: URL(fileURLWithPath: "/dev/null"),
            duration: 0,
            createdAt: Date()
        )
    }
}
