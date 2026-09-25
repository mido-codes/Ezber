import SwiftUI

/// A per-verse view of repetitions completed, last played, state, and notes.
struct VerseProgressDetailView: View {
    @Environment(AppEnvironment.self) private var app

    let verseID: VerseID
    let onDrill: (Surah, VerseRange) -> Void

    @State private var newNoteBody = ""

    var body: some View {
        List {
            Section {
                if let verse {
                    if !verse.transliteration.isEmpty {
                        TransliterationText(text: verse.transliteration, size: .detail)
                    }
                    if !verse.arabic.isEmpty {
                        ArabicText(text: verse.arabic)
                    }
                } else {
                    Text("Verse text not available.")
                        .foregroundStyle(EzberColor.mutedForeground)
                }
            }

            Section("Progress") {
                InfoRow(title: "Repetitions completed", value: "\(progress?.repetitionsCompleted ?? 0)")
                InfoRow(title: "Exposure count", value: "\(progress?.exposureCount ?? 0)")
                InfoRow(title: "Last played", value: lastPlayedText)
                HStack {
                    Text("State")
                        .foregroundStyle(EzberColor.mutedForeground)
                    Spacer()
                    VerseStateChip(state: progress?.state ?? .new)
                }
            }

            Section("Notes") {
                if notes.isEmpty {
                    Text("No notes for this verse yet.")
                        .foregroundStyle(EzberColor.mutedForeground)
                }
                ForEach(notes) { note in
                    VStack(alignment: .leading, spacing: EzberSpacing.x1) {
                        Text(note.body)
                            .font(EzberFont.body)
                        HStack(spacing: 6) {
                            Image(systemName: note.kind.systemImage)
                            Text(note.updatedAt.formatted(date: .abbreviated, time: .shortened))
                        }
                        .font(EzberFont.micro)
                        .foregroundStyle(EzberColor.mutedForeground)
                    }
                }
                TextField("Add a note", text: $newNoteBody, axis: .vertical)
                    .lineLimit(2...5)
                Button("Save note") {
                    addNote()
                }
                .disabled(newNoteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            Section {
                Button {
                    if let surah {
                        onDrill(surah, VerseRange(start: verseID.number, end: verseID.number))
                    }
                } label: {
                    Label("Drill this verse", systemImage: "play.fill")
                }
                .buttonStyle(EzberButtonStyle(tone: .primary))
                .disabled(surah == nil)
            }
        }
        .navigationTitle(verseID.reference)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var surah: Surah? {
        app.content.surah(id: verseID.surah)
    }

    private var verse: Verse? {
        app.content.verses(surahID: verseID.surah, in: VerseRange(start: verseID.number, end: verseID.number)).first
    }

    private var progress: VerseProgress? {
        app.userData.progress(for: verseID)
    }

    private var notes: [Note] {
        app.userData.notes(for: verseID)
    }

    private var lastPlayedText: String {
        guard let date = progress?.lastPlayedAt else { return "Never" }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    private func addNote() {
        let body = newNoteBody.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        app.userData.save(Note(verseID: verseID, body: body, kind: .text))
        app.notifyDataChanged()
        newNoteBody = ""
    }
}

#Preview {
    NavigationStack {
        VerseProgressDetailView(verseID: VerseID(surah: 55, number: 1)) { _, _ in }
    }
    .environment(AppEnvironment.preview())
}
