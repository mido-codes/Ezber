import AVFoundation
import Foundation

/// One playable span of audio for a queue item.
///
/// `endTime` is nil when the file is exactly the verse. When the content
/// pipeline ships chapter files with ayah timing, a resolver can return the
/// chapter URL plus the ayah's segment bounds instead.
struct DrillAudioTrack: Equatable {
    var url: URL
    var startTime: TimeInterval
    var endTime: TimeInterval?

    init(url: URL, startTime: TimeInterval = 0, endTime: TimeInterval? = nil) {
        self.url = url
        self.startTime = max(0, startTime)
        self.endTime = endTime
    }
}

/// Resolves the audio for a queue item. The drill engine only sees this
/// protocol, so a content-backed resolver can replace the placeholder one
/// without touching playback.
protocol DrillAudioResolving: AnyObject {
    func track(for item: DrillItem) -> DrillAudioTrack?
}

/// Placeholder audio until the content pipeline ships rights-cleared
/// recordings.
///
/// It looks first for a bundled per-verse file named
/// `verse-<surah>-<ayah>.<ext>` (`.m4a`, `.mp3`, `.caf`, `.wav`) — the seam the
/// content bundle can fill. When none exists it writes a quiet tone once per
/// verse into Caches, which keeps the full playback path — background session,
/// lock-screen controls, repeat boundaries — exercisable while no recitation
/// may be redistributed.
final class PlaceholderDrillAudioResolver: DrillAudioResolving {
    static let supportedExtensions = ["m4a", "mp3", "caf", "wav"]
    static let toneDuration: TimeInterval = 3

    private let bundle: Bundle
    private let fileManager: FileManager
    private let cacheDirectory: URL?

    init(bundle: Bundle = .main, fileManager: FileManager = .default) {
        self.bundle = bundle
        self.fileManager = fileManager
        let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
        self.cacheDirectory = caches?.appendingPathComponent("Ezber/PlaceholderAudio", isDirectory: true)
    }

    func track(for item: DrillItem) -> DrillAudioTrack? {
        if let bundled = bundledTrack(for: item) {
            return bundled
        }
        return generatedTrack(for: item)
    }

    private func bundledTrack(for item: DrillItem) -> DrillAudioTrack? {
        let name = "verse-\(item.verse.surahID)-\(item.verse.number)"
        for fileExtension in Self.supportedExtensions {
            if let url = bundle.url(forResource: name, withExtension: fileExtension) {
                return DrillAudioTrack(url: url)
            }
        }
        return nil
    }

    private func generatedTrack(for item: DrillItem) -> DrillAudioTrack? {
        guard let cacheDirectory else { return nil }
        if !fileManager.fileExists(atPath: cacheDirectory.path) {
            try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
        }
        let url = cacheDirectory.appendingPathComponent(
            "verse-\(item.verse.surahID)-\(item.verse.number).wav"
        )
        if !fileManager.fileExists(atPath: url.path) {
            try? Self.writeTone(
                to: url,
                frequency: Self.frequency(forVerse: item.verse.number),
                duration: Self.toneDuration
            )
        }
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        return DrillAudioTrack(url: url)
    }

    /// A pentatonic scale so consecutive verses still sound calm together.
    static func frequency(forVerse verseNumber: Int) -> Double {
        let scale: [Double] = [220.00, 261.63, 293.66, 329.63, 392.00]
        return scale[(max(1, verseNumber) - 1) % scale.count]
    }

    /// Writes a short, quiet 16-bit WAV sine tone with a fade in and out.
    static func writeTone(to url: URL, frequency: Double, duration: TimeInterval) throws {
        let sampleRate = 44_100.0
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false
        ]
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1),
              let buffer = AVAudioPCMBuffer(
                  pcmFormat: format,
                  frameCapacity: AVAudioFrameCount(sampleRate * max(0.05, duration))
              ),
              let samples = buffer.floatChannelData?[0]
        else { return }

        buffer.frameLength = buffer.frameCapacity
        let frameCount = Int(buffer.frameCapacity)
        let attack = 0.05
        let release = 0.4
        let total = Double(frameCount) / sampleRate
        for frame in 0..<frameCount {
            let time = Double(frame) / sampleRate
            let fadeIn = min(1, time / attack)
            let fadeOut = min(1, max(0, (total - time) / release))
            let value = sin(2 * Double.pi * frequency * time) * 0.07 * fadeIn * fadeOut
            samples[frame] = Float(value)
        }

        let file = try AVAudioFile(
            forWriting: url,
            settings: settings,
            commonFormat: .pcmFormatFloat32,
            interleaved: false
        )
        try file.write(from: buffer)
    }
}
