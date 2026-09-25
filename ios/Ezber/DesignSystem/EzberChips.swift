import SwiftUI

// MARK: - Verse state

extension VerseState {
    /// One hue, four depths (kit `verse-state-chips.tsx`): exposure as quiet
    /// fact, not a traffic-light score.
    var chipFill: Color {
        switch self {
        case .new: return .clear
        case .learning: return EzberColor.primary.opacity(0.20)
        case .review: return EzberColor.primary.opacity(0.55)
        case .strong: return EzberColor.primary
        }
    }

    var chipForeground: Color {
        switch self {
        case .new: return EzberColor.mutedForeground
        case .learning: return EzberColor.foreground
        case .review, .strong: return EzberColor.primaryForeground
        }
    }

    var chipBorder: Color? {
        self == .new ? EzberColor.border : nil
    }

    /// Solid representative of the state for dots and legends.
    var markerColor: Color {
        switch self {
        case .new: return EzberColor.muted
        case .learning: return EzberColor.primary.opacity(0.35)
        case .review: return EzberColor.primary.opacity(0.65)
        case .strong: return EzberColor.primary
        }
    }
}

/// The single-hue state chip: 14 pt medium, 14 × 6 pt padding, capsule.
struct VerseStateChip: View {
    let state: VerseState

    var body: some View {
        VerseStateChipBody(state: state)
    }
}

private struct VerseStateChipBody: View {
    @Environment(\.displayScale) private var displayScale

    let state: VerseState

    var body: some View {
        Text(LocalizedStringKey(state.label))
            .font(EzberFont.label)
            .foregroundStyle(state.chipForeground)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(state.chipFill, in: Capsule())
            .overlay(
                Capsule().strokeBorder(
                    state.chipBorder ?? .clear,
                    lineWidth: 1 / max(displayScale, 1)
                )
            )
    }
}

// MARK: - Accent cue

/// Muted honey pill reserved for the active-verse cue (repeat position, verse
/// reference). Never used for actions or progress.
struct EzberAccentChip: View {
    let text: String

    var body: some View {
        Text(text)
            .font(EzberFont.micro)
            .foregroundStyle(EzberColor.accentForeground)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(EzberColor.accent, in: Capsule())
    }
}

// MARK: - Downloads

extension DownloadState {
    /// One hue plus the existing iconography (report §6.4).
    var color: Color {
        switch self {
        case .notDownloaded: return EzberColor.mutedForeground
        case .downloading, .downloaded: return EzberColor.primary
        }
    }
}

#Preview {
    VStack(alignment: .leading, spacing: EzberSpacing.x4) {
        HStack(spacing: EzberSpacing.x2) {
            VerseStateChip(state: .new)
            VerseStateChip(state: .learning)
            VerseStateChip(state: .review)
            VerseStateChip(state: .strong)
        }
        EzberAccentChip(text: "Repeat 3 of 5")
    }
    .padding(EzberSpacing.screen)
    .background(EzberColor.background)
}
