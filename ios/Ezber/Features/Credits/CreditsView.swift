import SwiftUI

/// Text, transliteration, translation and reciter attributions with their
/// licenses. Provisional for this slice: the authoritative license registry is
/// owned by the rights work under `licenses/`.
struct CreditsView: View {
    var body: some View {
        List {
            Section("App") {
                Text("Ezber — a quiet Quran memorization and listening app, built with SwiftUI.")
            }

            Section("Quran text") {
                creditRow(
                    title: "Arabic text",
                    source: "Tanzil.net Uthmani text",
                    license: "CC BY 3.0",
                    url: "https://tanzil.net"
                )
            }

            Section("Transliteration") {
                creditRow(
                    title: "Transliteration",
                    source: "Quran.com / Quran Foundation",
                    license: "Pending — tracked in the licenses/ registry",
                    url: "https://quran.com"
                )
            }

            Section("Translation") {
                creditRow(
                    title: "English translation",
                    source: "M. M. Pickthall, The Meaning of the Glorious Koran",
                    license: "Public domain",
                    url: "https://www.gutenberg.org/ebooks/16955"
                )
            }

            Section("Audio") {
                creditRow(
                    title: "Recitation",
                    source: "Dhikr Al-Huda (placeholder reciter)",
                    license: "CC BY 4.0 — placeholder, rights pending",
                    url: "https://archive.org"
                )
            }

            Section("Open source") {
                Text("SQLite, bundled with iOS.")
                Text("SwiftUI and Foundation, Apple.")
            }

            Section("Fonts") {
                creditRow(
                    title: "Plus Jakarta Sans",
                    source: "Tokotype, via Google Fonts",
                    license: "SIL Open Font License 1.1",
                    url: "https://fonts.google.com/specimen/Plus+Jakarta+Sans"
                )
                creditRow(
                    title: "Source Serif 4",
                    source: "Adobe, via Google Fonts",
                    license: "SIL Open Font License 1.1",
                    url: "https://fonts.google.com/specimen/Source+Serif+4"
                )
                Text("OFL licence texts ship in the app bundle at Resources/Fonts/.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section {
                Text("Provisional attributions. The authoritative license registry lives in licenses/ in this repository and is maintained by the rights work.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Credits and licenses")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func creditRow(title: String, source: String, license: String, url: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.headline)
            Text(source)
                .font(.subheadline)
            Text(license)
                .font(.caption)
                .foregroundStyle(.secondary)
            if let link = URL(string: url) {
                Link(url, destination: link)
                    .font(.caption)
            }
        }
        .padding(.vertical, 2)
    }
}

#Preview {
    NavigationStack {
        CreditsView()
    }
}
