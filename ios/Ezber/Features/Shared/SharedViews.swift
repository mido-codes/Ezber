import SwiftUI

struct EmptyStateView: View {
    let systemImage: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text(title)
                .font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

struct StateBadge: View {
    let state: VerseState

    var body: some View {
        Text(LocalizedStringKey(state.label))
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(state.color.opacity(0.15), in: Capsule())
            .foregroundStyle(state.color)
    }
}

struct InfoRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(LocalizedStringKey(title))
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .multilineTextAlignment(.trailing)
        }
    }
}

struct SurahRow: View {
    let surah: Surah

    var body: some View {
        HStack(spacing: 12) {
            Text("\(surah.id)")
                .font(.footnote.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 28, alignment: .trailing)
            VStack(alignment: .leading, spacing: 2) {
                Text(surah.nameLatin)
                    .font(.body.weight(.medium))
                Text(surah.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(surah.nameArabic)
                .font(.title3)
                .foregroundStyle(.secondary)
        }
        .contentShape(Rectangle())
    }
}

/// The primary reading surface: transliteration in a serif face.
struct TransliterationText: View {
    let text: String
    var style: Font.TextStyle = .title2

    var body: some View {
        Text(text)
            .font(Theme.transliteration(style))
            .lineSpacing(8)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    VStack(spacing: 24) {
        EmptyStateView(
            systemImage: "books.vertical",
            title: "No presets yet",
            message: "Build a drill from a surah and section to see it here."
        )
        HStack {
            StateBadge(state: .new)
            StateBadge(state: .learning)
            StateBadge(state: .review)
            StateBadge(state: .strong)
        }
    }
    .padding()
}
