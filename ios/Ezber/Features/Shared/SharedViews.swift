import SwiftUI

struct EmptyStateView: View {
    let systemImage: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: EzberSpacing.x3) {
            Image(systemName: systemImage)
                .font(.system(size: 40))
                .foregroundStyle(EzberColor.mutedForeground)
            Text(title)
                .font(EzberFont.title)
                .foregroundStyle(EzberColor.foreground)
            Text(message)
                .font(EzberFont.caption)
                .foregroundStyle(EzberColor.mutedForeground)
                .multilineTextAlignment(.center)
        }
        .padding(EzberSpacing.x8)
        .frame(maxWidth: .infinity)
    }
}

struct InfoRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(LocalizedStringKey(title))
                .font(EzberFont.body)
                .foregroundStyle(EzberColor.mutedForeground)
            Spacer()
            Text(value)
                .font(EzberFont.body)
                .multilineTextAlignment(.trailing)
                .foregroundStyle(EzberColor.foreground)
        }
    }
}

struct SurahRow: View {
    let surah: Surah

    var body: some View {
        HStack(spacing: EzberSpacing.x3) {
            Text("\(surah.id)")
                .font(EzberFont.caption.monospacedDigit())
                .foregroundStyle(EzberColor.mutedForeground)
                .frame(width: 28, alignment: .trailing)
            VStack(alignment: .leading, spacing: 2) {
                Text(surah.nameLatin)
                    .font(EzberFont.bodyMedium)
                    .foregroundStyle(EzberColor.foreground)
                Text(surah.subtitle)
                    .font(EzberFont.caption)
                    .foregroundStyle(EzberColor.mutedForeground)
            }
            Spacer()
            Text(surah.nameArabic)
                .font(.system(size: EzberFont.arabicPoints))
                .foregroundStyle(EzberColor.mutedForeground)
        }
        .contentShape(Rectangle())
    }
}

/// The primary reading surface: transliteration in the kit's serif face
/// (Source Serif 4), sized from the kit's 16/20/30/48 pt scale.
struct TransliterationText: View {
    let text: String
    var size: EzberFont.TransliterationSize = .player

    var body: some View {
        Text(text)
            .font(EzberFont.transliteration(size))
            .lineSpacing(size.lineSpacing)
            .foregroundStyle(EzberColor.foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Arabic script: a first-class reading surface per the journey decisions. The
/// kit carries no Arabic token, so the scaffold's size and leading are named
/// here for a single tuning point.
struct ArabicText: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: EzberFont.arabicPoints))
            .lineSpacing(EzberFont.arabicLineSpacing)
            .foregroundStyle(EzberColor.foreground)
            .frame(maxWidth: .infinity, alignment: .trailing)
    }
}

#Preview {
    VStack(alignment: .leading, spacing: EzberSpacing.x6) {
        EmptyStateView(
            systemImage: "books.vertical",
            title: "No presets yet",
            message: "Build a drill from a surah and section to see it here."
        )
        HStack(spacing: EzberSpacing.x2) {
            VerseStateChip(state: .new)
            VerseStateChip(state: .learning)
            VerseStateChip(state: .review)
            VerseStateChip(state: .strong)
        }
        TransliterationText(text: "'Allamahul-bayaan", size: .player)
        ArabicText(text: "عَلَّمَ ٱلْقُرْآنَ")
    }
    .padding(EzberSpacing.screen)
    .background(EzberColor.background)
}
