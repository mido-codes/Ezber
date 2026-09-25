import SwiftUI

/// Button tones from the kit's action showcase: a moss primary pill, a quiet
/// bordered secondary, a text-only ghost and a tinted destructive. All are
/// capsules; the large size is the home CTA (64 pt, 38.5 pt continuous corners).
enum EzberButtonTone {
    case primary
    case secondary
    case ghost
    case destructive
}

enum EzberButtonSize {
    case regular
    case large
}

struct EzberButtonStyle: ButtonStyle {
    var tone: EzberButtonTone = .primary
    var size: EzberButtonSize = .regular
    /// Full-width, as the home CTA is.
    var expands = false

    func makeBody(configuration: Configuration) -> some View {
        EzberButtonBody(
            configuration: configuration,
            tone: tone,
            size: size,
            expands: expands
        )
    }
}

private struct EzberButtonBody: View {
    @Environment(\.displayScale) private var displayScale

    let configuration: ButtonStyleConfiguration
    let tone: EzberButtonTone
    let size: EzberButtonSize
    let expands: Bool

    var body: some View {
        configuration.label
            .font(font)
            .foregroundStyle(foreground)
            .padding(.horizontal, horizontalPadding)
            .frame(maxWidth: expands ? .infinity : nil)
            .frame(minHeight: minHeight)
            .background(fill, in: shape)
            .overlay(shape.stroke(border, lineWidth: 1 / max(displayScale, 1)))
            .contentShape(shape)
            .opacity(configuration.isPressed ? 0.85 : 1)
    }

    private var shape: AnyShape {
        switch size {
        case .regular:
            return AnyShape(Capsule())
        case .large:
            return AnyShape(RoundedRectangle(cornerRadius: EzberRadius.panel, style: .continuous))
        }
    }

    private var font: Font {
        switch (size, tone) {
        case (.large, _):
            return EzberFont.jakarta(.semibold, size: 16, relativeTo: .body)
        case (.regular, .primary):
            return EzberFont.jakarta(.semibold, size: 14, relativeTo: .subheadline)
        case (.regular, _):
            return EzberFont.label
        }
    }

    private var minHeight: CGFloat {
        size == .large ? 64 : 44
    }

    private var horizontalPadding: CGFloat {
        switch tone {
        case .primary, .secondary:
            return 24
        case .ghost:
            return 16
        case .destructive:
            return 20
        }
    }

    private var fill: Color {
        switch tone {
        case .primary: return EzberColor.primary
        case .secondary: return EzberColor.card
        case .ghost: return .clear
        case .destructive: return EzberColor.destructive.opacity(0.1)
        }
    }

    private var foreground: Color {
        switch tone {
        case .primary: return EzberColor.primaryForeground
        case .secondary: return EzberColor.foreground
        case .ghost: return EzberColor.mutedForeground
        case .destructive: return EzberColor.destructive
        }
    }

    private var border: Color {
        switch tone {
        case .secondary: return EzberColor.border
        case .primary, .ghost, .destructive: return .clear
        }
    }
}

/// Circular icon button from the showcase (44 pt default; play/pause in a
/// preset card).
struct EzberCircleIconButtonStyle: ButtonStyle {
    var filled = true
    var diameter: CGFloat = 44

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 18, weight: .medium))
            .foregroundStyle(filled ? EzberColor.primaryForeground : EzberColor.foreground)
            .frame(width: diameter, height: diameter)
            .background(filled ? EzberColor.primary : EzberColor.card, in: Circle())
            .overlay(
                Circle().strokeBorder(
                    filled ? .clear : EzberColor.border,
                    lineWidth: 1
                )
            )
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

#Preview {
    VStack(alignment: .leading, spacing: EzberSpacing.x4) {
        HStack(spacing: EzberSpacing.x3) {
            Button("Continue") {}
                .buttonStyle(EzberButtonStyle(tone: .primary))
            Button("New drill") {}
                .buttonStyle(EzberButtonStyle(tone: .secondary))
            Button("Skip") {}
                .buttonStyle(EzberButtonStyle(tone: .ghost))
        }
        Button("Delete preset") {}
            .buttonStyle(EzberButtonStyle(tone: .destructive))
        Button {
        } label: {
            Label("Continue drill", systemImage: "play.fill")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(EzberButtonStyle(tone: .primary, size: .large, expands: true))
    }
    .padding(EzberSpacing.screen)
    .background(EzberColor.background)
}
