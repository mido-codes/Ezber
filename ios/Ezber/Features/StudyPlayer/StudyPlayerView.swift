import SwiftUI

/// The heart of the app while a drill runs. Shows the current verse in
/// transliteration (Arabic optional), the repeat counter, and simple transport.
struct StudyPlayerView: View {
    @Environment(AppEnvironment.self) private var app

    let presetID: UUID

    @State private var model: StudyPlayerModel?
    @State private var loadFailed = false

    var body: some View {
        Group {
            if let model {
                StudyPlayerContent(model: model)
            } else if loadFailed {
                EmptyStateView(
                    systemImage: "exclamationmark.triangle",
                    title: "Preset unavailable",
                    message: "This preset could not be loaded from the user store."
                )
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle(model?.preset.name ?? "Study")
        .navigationBarTitleDisplayMode(.inline)
        .task { load() }
    }

    private func load() {
        guard model == nil else { return }
        guard
            let preset = app.userData.preset(id: presetID),
            let surah = app.content.surah(id: preset.surahID)
        else {
            loadFailed = true
            return
        }
        let verses = app.content.verses(surahID: preset.surahID, in: preset.range)
        let queue = DrillQueue.build(preset: preset, surah: surah, verses: verses)
        model = StudyPlayerModel(preset: preset, surah: surah, queue: queue, environment: app)
    }
}

private struct StudyPlayerContent: View {
    let model: StudyPlayerModel

    @State private var showNoteComposer = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    positionHeader
                    verseCard
                    queueCard
                }
                .padding()
            }
            transportBar
        }
        .background(Theme.warmBackground.ignoresSafeArea())
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showNoteComposer = true
                } label: {
                    Image(systemName: "square.and.pencil")
                }
                .accessibilityLabel("Add note")
            }
        }
        .sheet(isPresented: $showNoteComposer) {
            NoteComposerSheet(model: model)
        }
        .onDisappear {
            model.teardown()
        }
    }

    private var positionHeader: some View {
        HStack {
            Text("Verse \(model.positionInSection) of \(model.sectionCount)")
            Spacer()
            Text("\(model.surah.nameLatin) \(model.currentVerse?.reference ?? "")")
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
    }

    private var verseCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            if model.preset.display.showArabic,
               let arabic = model.currentVerse?.arabic,
               !arabic.isEmpty {
                Text(arabic)
                    .font(.system(size: 30))
                    .lineSpacing(10)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }

            if model.preset.display.showTransliteration,
               let transliteration = model.currentVerse?.transliteration,
               !transliteration.isEmpty {
                TransliterationText(text: transliteration, style: .title2)
            }

            translationBlock

            Divider()

            HStack {
                Label("Repeat \(model.state.currentRepeat) of \(model.state.repeatCount)", systemImage: "repeat")
                    .font(.subheadline.weight(.medium))
                Spacer()
                if model.isCompleted {
                    Text("Completed")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.green)
                }
            }
        }
        .padding(20)
        .background(Theme.cardBackground, in: RoundedRectangle(cornerRadius: 20))
    }

    @ViewBuilder
    private var translationBlock: some View {
        if let translation = model.currentTranslation {
            if model.shouldShowTranslation {
                VStack(alignment: .leading, spacing: 4) {
                    Text(translation.text)
                        .font(.callout)
                    Text(translation.translator)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            } else if model.preset.display.translationMode == .tapToReveal {
                Button("Reveal translation") {
                    model.toggleTranslation()
                }
                .font(.footnote)
            } else if model.preset.display.translationMode == .hiddenDuringPlayback && model.isPlaying {
                Text("Translation hidden while playing")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var queueCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Drill queue")
                .font(.headline)
            ProgressView(value: model.state.progress)
                .tint(Theme.accent)
            HStack {
                Text("Item \(min(model.state.currentIndex + 1, max(1, model.state.totalItemCount))) of \(model.state.totalItemCount)")
                Spacer()
                Text("\(model.state.completedItemCount) completed")
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(model.queue.verseNumbers, id: \.self) { number in
                        let isCurrent = number == model.currentVerse?.number
                        Text("\(number)")
                            .font(.caption.monospacedDigit())
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                isCurrent ? AnyShapeStyle(Theme.accent) : AnyShapeStyle(Color.secondary.opacity(0.15)),
                                in: Capsule()
                            )
                            .foregroundStyle(isCurrent ? Color.white : Color.primary)
                    }
                }
            }
        }
        .padding(20)
        .background(Theme.cardBackground, in: RoundedRectangle(cornerRadius: 20))
    }

    private var transportBar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 28) {
                transportButton("backward.end.fill", label: "Previous verse") {
                    model.previousVerse()
                }
                transportButton("backward.fill", label: "Previous repeat") {
                    model.previousRepeat()
                }
                Button {
                    model.togglePlayPause()
                } label: {
                    Image(systemName: model.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 64))
                        .foregroundStyle(Theme.accent)
                }
                .accessibilityLabel(model.isPlaying ? "Pause" : "Play")
                transportButton("forward.fill", label: "Next repeat") {
                    model.nextRepeat()
                }
                transportButton("forward.end.fill", label: "Next verse") {
                    model.nextVerse()
                }
            }
            Text(model.reciterName)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 20)
        .background(.bar)
    }

    private func transportButton(
        _ systemImage: String,
        label: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.title2)
                .frame(width: 44, height: 44)
        }
        .accessibilityLabel(label)
    }
}

private struct NoteComposerSheet: View {
    @Bindable var model: StudyPlayerModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Note for \(model.currentVerse?.reference ?? "")") {
                    TextEditor(text: $model.noteDraft)
                        .frame(minHeight: 140)
                }
                Section {
                    Button("Save note") {
                        model.saveNote()
                        dismiss()
                    }
                    .disabled(model.noteDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .navigationTitle("Add note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

#Preview {
    NavigationStack {
        StudyPlayerView(presetID: PlaceholderContent.seededPresets[0].id)
    }
    .environment(AppEnvironment.preview())
}
