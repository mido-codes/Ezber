import SwiftUI
import UIKit

/// Restrained, warm, quiet. Transliteration gets a serif face; the palette is a
/// warm neutral that darkens for night and car use.
enum Theme {
    static let accent = Color("AccentColor")
    static let warmBackground = Color("WarmBackground")
    static let cardBackground = Color("CardBackground")

    static func transliteration(_ style: Font.TextStyle = .title2) -> Font {
        .system(style, design: .serif)
    }
}

extension VerseState {
    var color: Color {
        switch self {
        case .new: return .secondary
        case .learning: return .orange
        case .review: return .blue
        case .strong: return .green
        }
    }
}

extension DownloadState {
    var color: Color {
        switch self {
        case .notDownloaded: return .secondary
        case .downloading: return .orange
        case .downloaded: return .green
        }
    }
}
