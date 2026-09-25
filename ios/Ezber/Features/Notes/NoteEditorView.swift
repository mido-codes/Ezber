import SwiftUI

/// Compose or edit a verse note. Voice memos use the stub service; they are
/// stored as notes with transcription pending.
struct NoteEditorView: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.dismiss) private var dismiss

    let target: NotesView.NoteEditorTarget

    @State private var surahID = 1
    @State private var verseNumber = 1
    @State private var noteBody = ""
    @State private var kind: NoteKind = .text
    @State private var transcript: String?
    @State private var isTranscribed = false
    @State private var audioFileName: String?
    @State private var existingID: UUID?
    @State private var existingCreatedAt: Date?
    @State private var didLoad = false

    private var surah: Surah? {
        app.content.surah(id: surahID)
    }

    private var verseCount: Int {
        max(1, surah?.verseCount ?? 1)
    }

    var body: some View {
        NavigationStack {
            Form {
                if case .existing(let note) = target {
                    Section {
                        InfoRow(title: "Verse", value: note.verseID.reference)
                    }
                } else {
                    Section("Verse") {
                        Picker("Surah", selection: $surahID) {
                            ForEach(app.content.allSurahs()) { item in
                                Text("\(item.id). \(item.nameLatin)").tag(item.id)
                            }
                        }
                        Picker("Verse", selection: $verseNumber) {
                            ForEach(1...verseCount, id: \.self) { number in
                                Text("\(number)").tag(number)
                            }
                        }
                    }
                }

                Section("Note") {
                    TextEditor(text: $noteBody)
                        .frame(minHeight: 140)
                }

                Section("Voice memo") {
                    if kind == .voiceMemo {
                        Text(LocalizedStringKey(isTranscribed ? "Transcribed" : "Transcription pending (stub)"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        if let transcript, !transcript.isEmpty {
                            Text(transcript)
                                .font(.callout)
                        }
                    } else {
                        Button {
                            recordVoiceMemo()
                        } label: {
                            Label("Record voice memo (stub)", systemImage: "mic")
                        }
                    }
                }

                Section {
                    Button("Save") {
                        save()
                    }
                    .disabled(noteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .navigationTitle(existingID == nil ? "New note" : "Edit note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear(perform: load)
            .onChange(of: surahID) { _, _ in
                if verseNumber > verseCount {
                    verseNumber = verseCount
                }
            }
        }
    }

    private func load() {
        guard !didLoad else { return }
        didLoad = true
        guard case .existing(let note) = target else { return }
        surahID = note.verseID.surah
        verseNumber = note.verseID.number
        noteBody = note.body
        kind = note.kind
        transcript = note.transcript
        isTranscribed = note.isTranscribed
        audioFileName = note.audioFileName
        existingID = note.id
        existingCreatedAt = note.createdAt
    }

    private func recordVoiceMemo() {
        try? app.voiceMemo.startRecording()
        if let memo = (try? app.voiceMemo.stopRecording()) ?? nil {
            kind = .voiceMemo
            isTranscribed = false
            audioFileName = memo.url.lastPathComponent
        }
        if noteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            noteBody = "Voice memo"
        }
    }

    private func save() {
        let body = noteBody.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        let note = Note(
            id: existingID ?? UUID(),
            verseID: VerseID(surah: surahID, number: verseNumber),
            presetID: nil,
            body: body,
            kind: kind,
            transcript: transcript,
            isTranscribed: isTranscribed,
            audioFileName: audioFileName,
            createdAt: existingCreatedAt ?? Date(),
            updatedAt: Date()
        )
        app.userData.save(note)
        app.notifyDataChanged()
        dismiss()
    }
}

#Preview {
    NoteEditorView(target: .new)
        .environment(AppEnvironment.preview())
}
