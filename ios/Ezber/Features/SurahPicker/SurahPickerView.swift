import SwiftUI

/// Browse the 114 surahs with Arabic, Latin and English names, verse count and
/// revelation place. Selecting one moves on to the section range.
struct SurahPickerView: View {
    @Environment(AppEnvironment.self) private var app
    @State private var searchText = ""

    let onSelect: (Surah) -> Void

    var body: some View {
        List(filteredSurahs) { surah in
            Button {
                onSelect(surah)
            } label: {
                SurahRow(surah: surah)
            }
            .buttonStyle(.plain)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(EzberColor.background)
        .searchable(text: $searchText, prompt: "Search surahs")
        .navigationTitle("Choose a surah")
        .navigationBarTitleDisplayMode(.inline)
        .tint(EzberColor.primary)
    }

    private var filteredSurahs: [Surah] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return app.content.allSurahs() }
        return app.content.allSurahs().filter { surah in
            surah.nameLatin.lowercased().contains(query)
                || surah.nameEnglish.lowercased().contains(query)
                || surah.nameArabic.contains(query)
                || String(surah.id) == query
        }
    }
}

#Preview {
    NavigationStack {
        SurahPickerView { _ in }
    }
    .environment(AppEnvironment.preview())
}
