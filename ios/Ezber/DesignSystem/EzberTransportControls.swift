import SwiftUI

/// Five-button transport from the kit: previous/next verse (56 pt, 80 % ink),
/// previous/next repeat (56 pt, 60 % ink) and an 80 pt moss play/pause circle
/// with the kit's only shadow. `compact` is the 44/44/64 variant for narrow
/// contexts; the in-app player and any in-car surface use the full sizes.
struct EzberTransportControls: View {
    let isPlaying: Bool
    let compact: Bool
    let onPreviousVerse: () -> Void
    let onPreviousRepeat: () -> Void
    let onPlayPause: () -> Void
    let onNextRepeat: () -> Void
    let onNextVerse: () -> Void

    init(
        isPlaying: Bool,
        compact: Bool = false,
        onPreviousVerse: @escaping () -> Void,
        onPreviousRepeat: @escaping () -> Void,
        onPlayPause: @escaping () -> Void,
        onNextRepeat: @escaping () -> Void,
        onNextVerse: @escaping () -> Void
    ) {
        self.isPlaying = isPlaying
        self.compact = compact
        self.onPreviousVerse = onPreviousVerse
        self.onPreviousRepeat = onPreviousRepeat
        self.onPlayPause = onPlayPause
        self.onNextRepeat = onNextRepeat
        self.onNextVerse = onNextVerse
    }

    var body: some View {
        HStack(spacing: EzberSpacing.x3) {
            TransportButton(
                systemImage: "backward.end.fill",
                iconSize: compact ? 20 : 24,
                opacity: 0.8,
                label: "Previous verse",
                compact: compact,
                action: onPreviousVerse
            )
            TransportButton(
                systemImage: "repeat",
                iconSize: compact ? 16 : 20,
                opacity: 0.6,
                label: "Previous repeat",
                compact: compact,
                action: onPreviousRepeat
            )
            Button(action: onPlayPause) {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: compact ? 28 : 36, weight: .medium))
                    .foregroundStyle(EzberColor.primaryForeground)
                    .frame(width: centerSize, height: centerSize)
                    .background(EzberColor.primary, in: Circle())
            }
            .buttonStyle(.plain)
            .ezberSmShadow()
            .accessibilityLabel(isPlaying ? "Pause" : "Play")
            TransportButton(
                systemImage: "repeat",
                iconSize: compact ? 16 : 20,
                opacity: 0.6,
                label: "Next repeat",
                compact: compact,
                action: onNextRepeat
            )
            TransportButton(
                systemImage: "forward.end.fill",
                iconSize: compact ? 20 : 24,
                opacity: 0.8,
                label: "Next verse",
                compact: compact,
                action: onNextVerse
            )
        }
    }

    @ScaledMetric(relativeTo: .body) private var regularCenter: CGFloat = 80
    @ScaledMetric(relativeTo: .body) private var compactCenter: CGFloat = 64

    private var centerSize: CGFloat { compact ? compactCenter : regularCenter }
}

private struct TransportButton: View {
    let systemImage: String
    let iconSize: CGFloat
    let opacity: Double
    let label: String
    let compact: Bool
    let action: () -> Void

    @ScaledMetric(relativeTo: .body) private var regularSide: CGFloat = 56
    @ScaledMetric(relativeTo: .body) private var compactSide: CGFloat = 44

    init(
        systemImage: String,
        iconSize: CGFloat,
        opacity: Double,
        label: String,
        compact: Bool,
        action: @escaping () -> Void
    ) {
        self.systemImage = systemImage
        self.iconSize = iconSize
        self.opacity = opacity
        self.label = label
        self.compact = compact
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: iconSize, weight: .regular))
                .foregroundStyle(EzberColor.foreground.opacity(opacity))
                .frame(width: compact ? compactSide : regularSide, height: compact ? compactSide : regularSide)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

#Preview {
    VStack(spacing: EzberSpacing.x6) {
        EzberTransportControls(
            isPlaying: false,
            onPreviousVerse: {},
            onPreviousRepeat: {},
            onPlayPause: {},
            onNextRepeat: {},
            onNextVerse: {}
        )
        EzberTransportControls(
            isPlaying: true,
            compact: true,
            onPreviousVerse: {},
            onPreviousRepeat: {},
            onPlayPause: {},
            onNextRepeat: {},
            onNextVerse: {}
        )
    }
    .padding(EzberSpacing.screen)
    .background(EzberColor.background)
}
