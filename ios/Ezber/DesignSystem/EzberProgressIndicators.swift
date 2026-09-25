import SwiftUI

/// Repeat bar: 6 pt muted capsule track with a primary fill (kit
/// `h-1.5 rounded-full bg-muted` + `bg-primary`).
struct EzberProgressBar: View {
    /// 0...1; values outside the range are clamped.
    let value: Double
    var height: CGFloat = 6

    private var clamped: Double {
        min(max(value, 0), 1)
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(EzberColor.muted)
                Capsule()
                    .fill(EzberColor.primary)
                    .frame(width: proxy.size.width * clamped)
            }
        }
        .frame(height: height)
        .accessibilityElement()
        .accessibilityLabel("Progress")
        .accessibilityValue("\(Int((clamped * 100).rounded())) percent")
    }
}

/// Section progress: one 8 pt capsule per verse in the section, filled up to
/// the current position (kit five-segment bar).
struct EzberSegmentProgress: View {
    let total: Int
    let filled: Int
    var height: CGFloat = 8

    var body: some View {
        HStack(spacing: EzberSpacing.x2) {
            ForEach(0..<max(total, 1), id: \.self) { index in
                Capsule()
                    .fill(index < filled ? EzberColor.primary : EzberColor.muted)
                    .frame(height: height)
                    .frame(maxWidth: .infinity)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Section progress")
        .accessibilityValue("\(filled) of \(max(total, 1))")
    }
}

#Preview {
    VStack(alignment: .leading, spacing: EzberSpacing.x5) {
        EzberProgressBar(value: 0.6)
        EzberSegmentProgress(total: 5, filled: 3)
    }
    .padding(EzberSpacing.screen)
    .background(EzberColor.card)
}
