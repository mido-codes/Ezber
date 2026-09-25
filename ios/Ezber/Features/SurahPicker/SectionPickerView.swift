import SwiftUI

/// Pick the verse range for a drill. The default is a short section of five
/// verses; "Full surah" is one tap away.
struct SectionPickerView: View {
    @Environment(AppEnvironment.self) private var app

    let surahID: Int
    let onContinue: (Surah, VerseRange) -> Void

    @State private var start = 1
    @State private var end = 5
    @State private var didLoadDefaults = false

    private var surah: Surah? {
        app.content.surah(id: surahID)
    }

    private var verseCount: Int {
        max(1, surah?.verseCount ?? 1)
    }

    var body: some View {
        Form {
            if let surah {
                Section {
                    SurahRow(surah: surah)
                }

                Section("Range") {
                    Picker("From", selection: $start) {
                        ForEach(1...verseCount, id: \.self) { number in
                            Text("Verse \(number)").tag(number)
                        }
                    }
                    Picker("To", selection: $end) {
                        ForEach(1...verseCount, id: \.self) { number in
                            Text("Verse \(number)").tag(number)
                        }
                    }
                    Button("First 5 verses") {
                        start = 1
                        end = min(5, verseCount)
                    }
                    Button("Full surah") {
                        start = 1
                        end = verseCount
                    }
                    InfoRow(title: "Section length", value: "\(max(0, end - start + 1)) verses")
                }

                Section("Preview") {
                    if let verse = previewVerse {
                        if !verse.transliteration.isEmpty {
                            TransliterationText(text: verse.transliteration, style: .body)
                        }
                        Text(verse.reference)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                EmptyStateView(
                    systemImage: "exclamationmark.triangle",
                    title: "Surah unavailable",
                    message: "This surah is not in the content store."
                )
            }
        }
        .navigationTitle("Choose a section")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Continue") {
                    guard let surah else { return }
                    onContinue(surah, VerseRange(start: start, end: end))
                }
                .disabled(surah == nil)
            }
        }
        .onAppear {
            guard !didLoadDefaults else { return }
            didLoadDefaults = true
            end = min(5, verseCount)
        }
        .onChange(of: start) { _, newValue in
            if end < newValue {
                end = newValue
            }
        }
        .onChange(of: end) { _, newValue in
            if start > newValue {
                start = newValue
            }
        }
    }

    private var previewVerse: Verse? {
        app.content.verses(surahID: surahID, in: VerseRange(start: start, end: start)).first
    }
}

#Preview {
    NavigationStack {
        SectionPickerView(surahID: 55) { _, _ in }
    }
    .environment(AppEnvironment.preview())
}
