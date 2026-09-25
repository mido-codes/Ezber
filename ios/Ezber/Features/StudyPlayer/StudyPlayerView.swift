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
                VStack(alignment: .leading, spacing: EzberSpacing.x5) {
                    positionHeader
                    verseCard
                    queueCard
                }
                .padding(EzberSpacing.screen)
            }
            transportBar
        }
        .background(EzberColor.background.ignoresSafeArea())
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
        .font(EzberFont.caption)
        .foregroundStyle(EzberColor.mutedForeground)
    }

    private var verseCard: some View {
        VStack(alignment: .leading, spacing: EzberSpacing.x4) {
            if model.preset.display.showArabic,
               let arabic = model.currentVerse?.arabic,
               !arabic.isEmpty {
                ArabicText(text: arabic)
            }

            if model.preset.display.showTransliteration,
               let transliteration = model.currentVerse?.transliteration,
               !transliteration.isEmpty {
                TransliterationText(text: transliteration, size: .player)
            }

            translationBlock

            Rectangle()
                .fill(EzberColor.border)
                .frame(height: 1)

            HStack {
                EzberAccentChip(text: "Repeat \(model.state.currentRepeat) of \(model.state.repeatCount)")
                Spacer()
                if model.isCompleted {
                    Text("Completed")
                        .font(EzberFont.label)
                        .foregroundStyle(EzberColor.primary)
                }
            }
        }
        .ezberCard()
    }

    // TODO(translation-ui): translation is a resolved-removed surface (captain
    // decision #1) but is kept here while the placeholder content still has a
    // translations column; the visual port only restyles it. Remove with the
    // translation model, not as part of this design pass.
    @ViewBuilder
    private var translationBlock: some View {
        if let translation = model.currentTranslation {
            if model.shouldShowTranslation {
                VStack(alignment: .leading, spacing: EzberSpacing.x1) {
                    Text(translation.text)
                        .font(EzberFont.body)
                        .foregroundStyle(EzberColor.foreground)
                    Text(translation.translator)
                        .font(EzberFont.micro)
                        .foregroundStyle(EzberColor.mutedForeground)
                }
            } else if model.preset.display.translationMode == .tapToReveal {
                Button("Reveal translation") {
                    model.toggleTranslation()
                }
                .buttonStyle(EzberButtonStyle(tone: .ghost))
            } else if model.preset.display.translationMode == .hiddenDuringPlayback && model.isPlaying {
                Text("Translation hidden while playing")
                    .font(EzberFont.caption)
                    .foregroundStyle(EzberColor.mutedForeground)
            }
        }
    }

    private var queueCard: some View {
        VStack(alignment: .leading, spacing: EzberSpacing.x3) {
            Text("Drill queue")
                .font(EzberFont.bodyMedium)
                .foregroundStyle(EzberColor.foreground)
            EzberProgressBar(value: model.state.progress)
            HStack {
                Text("Item \(min(model.state.currentIndex + 1, max(1, model.state.totalItemCount))) of \(model.state.totalItemCount)")
                Spacer()
                Text("\(model.state.completedItemCount) completed")
            }
            .font(EzberFont.caption)
            .foregroundStyle(EzberColor.mutedForeground)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: EzberSpacing.x2) {
                    ForEach(model.queue.verseNumbers, id: \.self) { number in
                        let isCurrent = number == model.currentVerse?.number
                        Text("\(number)")
                            .font(EzberFont.label.monospacedDigit())
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                isCurrent ? EzberColor.primary : EzberColor.muted,
                                in: Capsule()
                            )
                            .foregroundStyle(
                                isCurrent ? EzberColor.primaryForeground : EzberColor.foreground
                            )
                    }
                }
            }
        }
        .ezberCard()
    }

    private var transportBar: some View {
        VStack(spacing: EzberSpacing.x3) {
            EzberSegmentProgress(total: model.sectionCount, filled: model.positionInSection)
            EzberTransportControls(
                isPlaying: model.isPlaying,
                onPreviousVerse: { model.previousVerse() },
                onPreviousRepeat: { model.previousRepeat() },
                onPlayPause: { model.togglePlayPause() },
                onNextRepeat: { model.nextRepeat() },
                onNextVerse: { model.nextVerse() }
            )
            Text(model.reciterName)
                .font(EzberFont.caption)
                .foregroundStyle(EzberColor.mutedForeground)
        }
        .padding(.vertical, EzberSpacing.x3)
        .padding(.horizontal, EzberSpacing.x5)
        .frame(maxWidth: .infinity)
        .background(EzberColor.background)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(EzberColor.border)
                .frame(height: 1)
        }
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
