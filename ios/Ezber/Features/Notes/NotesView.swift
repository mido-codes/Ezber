import SwiftUI

/// Verse-level notes, searchable, with voice memos marked as transcription
/// pending until the real capture/transcription pipeline lands.
struct NotesView: View {
    @Environment(AppEnvironment.self) private var app
    @State private var searchText = ""
    @State private var editorTarget: NoteEditorTarget?

    enum NoteEditorTarget: Identifiable {
        case new
        case existing(Note)

        var id: String {
            switch self {
            case .new: return "new"
            case .existing(let note): return note.id.uuidString
            }
        }
    }

    var body: some View {
        let _ = app.dataRevision
        NavigationStack {
            List(filteredNotes) { note in
                Button {
                    editorTarget = .existing(note)
                } label: {
                    NoteRow(note: note, surah: app.content.surah(id: note.verseID.surah))
                }
                .buttonStyle(.plain)
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        app.userData.deleteNote(id: note.id)
                        app.notifyDataChanged()
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
            .listStyle(.plain)
            .overlay {
                if filteredNotes.isEmpty {
                    EmptyStateView(
                        systemImage: "note.text",
                        title: "No notes",
                        message: searchText.isEmpty
                            ? "Notes you add while drilling will appear here."
                            : "No notes match your search."
                    )
                }
            }
            .searchable(text: $searchText, prompt: "Search notes")
            .navigationTitle("Notes")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editorTarget = .new
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("New note")
                }
            }
            .sheet(item: $editorTarget) { target in
                NoteEditorView(target: target)
            }
        }
    }

    private var filteredNotes: [Note] {
        let notes = app.userData.allNotes()
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return notes }
        return notes.filter { $0.searchableText.contains(query) }
    }
}

private struct NoteRow: View {
    let note: Note
    let surah: Surah?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: note.kind.systemImage)
                .foregroundStyle(Theme.accent)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(note.verseID.reference)
                        .font(.caption.monospacedDigit().weight(.semibold))
                    if let surah {
                        Text(surah.nameLatin)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Text(note.body)
                    .font(.subheadline)
                    .lineLimit(3)
                HStack(spacing: 6) {
                    Text(note.updatedAt.formatted(date: .abbreviated, time: .shortened))
                    if note.kind == .voiceMemo && !note.isTranscribed {
                        Text("· transcription pending")
                    }
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

#Preview {
    NotesView()
        .environment(AppEnvironment.preview())
}
