import Foundation
import MediaPlayer
import UIKit

/// Publishes drill metadata to the app's audio session and mirrors it into
/// `MPNowPlayingInfoCenter`.
///
/// `AudioSessionService` stays the source of truth — the real implementation
/// will publish the same `NowPlayingInfo` to the lock screen and Control Center.
/// The mirror is what makes the CarPlay now-playing surface (and the lock
/// screen, while the stub is in place) render the current verse at all.
///
/// Publishing is change-gated: identical info is dropped, so the coordinator's
/// one-second safety tick never churns the now-playing center or the CarPlay
/// screen.
@MainActor
final class CarPlayNowPlayingCenter {
    private let audioSession: any AudioSessionService
    private var lastPublished: NowPlayingInfo?

    init(audioSession: any AudioSessionService) {
        self.audioSession = audioSession
    }

    func publish(_ info: NowPlayingInfo?, force: Bool = false) {
        if !force, info == lastPublished { return }
        lastPublished = info
        audioSession.updateNowPlaying(info)
        applyToSystem(info)
    }

    private func applyToSystem(_ info: NowPlayingInfo?) {
        let center = MPNowPlayingInfoCenter.default()
        guard let info else {
            center.nowPlayingInfo = nil
            center.playbackState = .stopped
            return
        }

        var metadata: [String: Any] = [
            MPMediaItemPropertyTitle: info.title,
            MPMediaItemPropertyArtist: info.subtitle,
            MPMediaItemPropertyAlbumTitle: info.albumTitle,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: info.elapsed,
            MPNowPlayingInfoPropertyPlaybackRate: info.playbackRate,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: Float(1),
            MPNowPlayingInfoPropertyPlaybackQueueIndex: info.queuePosition,
            MPNowPlayingInfoPropertyPlaybackQueueCount: info.queueCount,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue
        ]
        if info.duration > 0 {
            metadata[MPMediaItemPropertyPlaybackDuration] = info.duration
        }
        if let artworkName = info.artworkName, let image = UIImage(named: artworkName) {
            metadata[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        }
        center.nowPlayingInfo = metadata
        center.playbackState = info.playbackRate > 0 ? .playing : .paused
    }
}
