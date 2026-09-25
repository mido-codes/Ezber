import SwiftUI

/// The kit's catalogue/section header: a tracked eyebrow, a 24 pt semibold
/// title and an optional muted description.
struct EzberSectionHeading: View {
    let eyebrow: String
    let title: String
    var description: String?

    var body: some View {
        VStack(alignment: .leading, spacing: EzberSpacing.x2) {
            Text(eyebrow)
                .ezberEyebrow()
                .foregroundStyle(EzberColor.mutedForeground)
            Text(title)
                .font(EzberFont.screenTitle)
                .foregroundStyle(EzberColor.foreground)
            if let description {
                Text(description)
                    .font(EzberFont.body)
                    .foregroundStyle(EzberColor.mutedForeground)
            }
        }
    }
}

#Preview {
    EzberSectionHeading(
        eyebrow: "Components",
        title: "Progress",
        description: "A drill is a queue of verse × repetition."
    )
    .padding(EzberSpacing.screen)
    .background(EzberColor.background)
}
