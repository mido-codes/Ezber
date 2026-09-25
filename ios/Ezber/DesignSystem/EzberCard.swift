import SwiftUI

/// Raised surface: `card` fill, 1 px `border` hairline, 32 pt continuous
/// corners (kit `rounded-2xl border border-border bg-card`). Padding defaults
/// to 20 pt; pass 16 or 24 for the kit's other sizes.
struct EzberCard<Content: View>: View {
    var padding: CGFloat
    var emphasized: Bool
    private let content: Content

    init(
        padding: CGFloat = EzberSpacing.card,
        emphasized: Bool = false,
        @ViewBuilder content: () -> Content
    ) {
        self.padding = padding
        self.emphasized = emphasized
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: RoundedRectangle(cornerRadius: EzberRadius.card, style: .continuous))
            .ezberBorder(radius: EzberRadius.card, color: stroke)
    }

    private var fill: Color {
        emphasized ? EzberColor.secondary : EzberColor.card
    }

    private var stroke: Color {
        emphasized ? EzberColor.primary.opacity(0.3) : EzberColor.border
    }
}

/// Plain card chrome for content that draws its own layout.
extension View {
    func ezberCard(
        padding: CGFloat = EzberSpacing.card,
        emphasized: Bool = false
    ) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                emphasized ? EzberColor.secondary : EzberColor.card,
                in: RoundedRectangle(cornerRadius: EzberRadius.card, style: .continuous)
            )
            .ezberBorder(
                radius: EzberRadius.card,
                color: emphasized ? EzberColor.primary.opacity(0.3) : EzberColor.border
            )
    }
}

#Preview {
    VStack(spacing: EzberSpacing.x4) {
        EzberCard {
            Text("Default card")
                .font(EzberFont.bodyMedium)
                .foregroundStyle(EzberColor.foreground)
        }
        EzberCard(emphasized: true) {
            Text("Emphasized card")
                .font(EzberFont.bodyMedium)
                .foregroundStyle(EzberColor.foreground)
        }
    }
    .padding(EzberSpacing.screen)
    .background(EzberColor.background)
}
