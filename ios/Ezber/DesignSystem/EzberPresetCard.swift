import SwiftUI

/// Saved-drill row from the kit: name (16 pt medium), a `range · ×repeats ·
/// reciter` meta line (14 pt muted) and a 44 pt moss play button. `emphasized`
/// marks the last-used preset with the kit's `border-primary/30` + `secondary`
/// treatment.
struct EzberPresetCard: View {
    let name: String
    let meta: String
    let emphasized: Bool
    let onPlay: () -> Void

    init(
        name: String,
        meta: String,
        emphasized: Bool = false,
        onPlay: @escaping () -> Void
    ) {
        self.name = name
        self.meta = meta
        self.emphasized = emphasized
        self.onPlay = onPlay
    }

    var body: some View {
        HStack(spacing: EzberSpacing.x4) {
            VStack(alignment: .leading, spacing: EzberSpacing.x1) {
                Text(name)
                    .font(EzberFont.bodyMedium)
                    .foregroundStyle(EzberColor.foreground)
                    .lineLimit(1)
                Text(meta)
                    .font(EzberFont.caption)
                    .foregroundStyle(EzberColor.mutedForeground)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
            Button(action: onPlay) {
                Image(systemName: "play.fill")
            }
            .buttonStyle(EzberCircleIconButtonStyle(diameter: playSize))
            .accessibilityLabel("Play \(name)")
        }
        .ezberCard(padding: EzberSpacing.cardCompact, emphasized: emphasized)
    }

    @ScaledMetric(relativeTo: .body) private var playSize: CGFloat = 44
}

#Preview {
    VStack(spacing: EzberSpacing.x3) {
        EzberPresetCard(
            name: "Ar-Rahman 1–5",
            meta: "55:1–5 · ×5 · Dhikr Al-Huda",
            emphasized: true
        ) {}
        EzberPresetCard(
            name: "Al-Mulk evening",
            meta: "67:1–5 · ×3 · Dhikr Al-Huda"
        ) {}
    }
    .padding(EzberSpacing.screen)
    .background(EzberColor.background)
}
