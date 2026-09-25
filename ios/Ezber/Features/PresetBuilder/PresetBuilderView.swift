import SwiftUI

/// Define a drill and save it: surah and range, per-verse repeats with
/// overrides, reciter, display options, pause and loop.
struct PresetBuilderView: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.dismiss) private var dismiss

    let route: PresetBuilderRoute
    let onSaved: (Preset) -> Void

    @State private var draft = PresetDraft()
    @State private var didLoad = false
    @State private var showReciterPicker = false

    private var surah: Surah? {
        app.content.surah(id: draft.surahID)
    }

    private var verseCount: Int {
        max(1, surah?.verseCount ?? 1)
    }

    private var existingPreset: Preset? {
        if case .edit(let id) = route {
            return app.userData.preset(id: id)
        }
        return nil
    }

    private var isEditing: Bool {
        if case .edit = route { return true }
        return false
    }

    var body: some View {
        Form {
            Section("Name") {
                TextField("Preset name", text: $draft.name)
            }

            Section("Surah and section") {
                Picker("Surah", selection: $draft.surahID) {
                    ForEach(app.content.allSurahs()) { item in
                        Text("\(item.id). \(item.nameLatin)").tag(item.id)
                    }
                }
                Stepper("From verse \(draft.range.start)", value: $draft.range.start, in: 1...verseCount)
                Stepper("To verse \(draft.range.end)", value: $draft.range.end, in: 1...verseCount)
                InfoRow(title: "Section length", value: "\(draft.range.count) verses")
                InfoRow(title: "Total repetitions", value: "\(draft.repeats.totalRepetitions(in: draft.range))")
            }

            Section("Repeats") {
                Stepper("Default repeats: \(draft.defaultRepeats)", value: $draft.defaultRepeats, in: 1...50)
                if !draft.overrides.isEmpty {
                    Button("Reset per-verse overrides") {
                        draft.overrides.removeAll()
                    }
                }
                ForEach(draft.verseNumbers, id: \.self) { number in
                    HStack {
                        Text("Verse \(number)")
                        if draft.overrides[number] != nil {
                            Text("override")
                                .font(.caption2)
                                .foregroundStyle(Theme.accent)
                        }
                        Spacer()
                        Stepper(
                            "Repeats",
                            value: repeatBinding(for: number),
                            in: 1...50
                        )
                        .labelsHidden()
                        Text("\(draft.repeats.repeats(forVerse: number))×")
                            .font(.body.monospacedDigit())
                            .frame(width: 40, alignment: .trailing)
                    }
                }
            }

            Section("Reciter") {
                Button {
                    showReciterPicker = true
                } label: {
                    HStack {
                        Text("Reciter")
                            .foregroundStyle(.primary)
                        Spacer()
                        Text(reciterName)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section("Display") {
                Toggle("Transliteration", isOn: $draft.showTransliteration)
                Toggle("Arabic script", isOn: $draft.showArabic)
                Picker("Translation", selection: $draft.translationMode) {
                    ForEach(TranslationMode.allCases) { mode in
                        Text(LocalizedStringKey(mode.label)).tag(mode)
                    }
                }
                Picker("Transliteration style", selection: $draft.transliterationStyle) {
                    ForEach(TransliterationStyle.allCases) { style in
                        Text(LocalizedStringKey(style.label)).tag(style)
                    }
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Pause between repeats: \(draft.pauseBetweenRepeats, specifier: "%.1f")s")
                    Slider(value: $draft.pauseBetweenRepeats, in: 0...5, step: 0.5)
                }
                Toggle("Loop until stopped", isOn: $draft.loopUntilStopped)
            }

            Section {
                Button(isEditing ? "Save changes" : "Save preset") {
                    save()
                }
                .disabled(surah == nil)
            }
        }
        .navigationTitle(isEditing ? "Edit preset" : "New preset")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showReciterPicker) {
            NavigationStack {
                ReciterPickerView(selectedID: draft.reciterID) { reciter in
                    draft.reciterID = reciter.id
                    showReciterPicker = false
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showReciterPicker = false }
                    }
                }
            }
        }
        .onAppear(perform: load)
        .onChange(of: draft.surahID) { _, _ in
            clampRange()
        }
        .onChange(of: draft.range.start) { _, _ in
            clampRange()
        }
    }

    private var reciterName: String {
        app.content.reciter(id: draft.reciterID)?.name ?? draft.reciterID
    }

    private func repeatBinding(for number: Int) -> Binding<Int> {
        Binding(
            get: { draft.repeats.repeats(forVerse: number) },
            set: { newValue in
                let clamped = max(1, min(99, newValue))
                if clamped == draft.defaultRepeats {
                    draft.overrides.removeValue(forKey: number)
                } else {
                    draft.overrides[number] = clamped
                }
            }
        )
    }

    private func load() {
        guard !didLoad else { return }
        didLoad = true
        switch route {
        case .new(let surahID, let range):
            let fallbackSurah = app.userData.lastUsedPreset()?.surahID ?? 1
            draft = PresetDraft.new(
                surahID: surahID ?? fallbackSurah,
                range: range,
                settings: app.settings,
                reciters: app.content.allReciters()
            )
        case .edit(let id):
            if let preset = app.userData.preset(id: id) {
                draft = PresetDraft.from(preset: preset)
            }
        }
        clampRange()
    }

    private func clampRange() {
        let clamped = draft.range.clamped(toVerseCount: verseCount)
        if clamped != draft.range {
            draft.range = clamped
        }
        if draft.overrides.isEmpty == false {
            let valid = Set(draft.verseNumbers)
            draft.overrides = draft.overrides.filter { valid.contains($0.key) }
        }
    }

    private func save() {
        guard let surah else { return }
        let preset = draft.makePreset(existing: existingPreset, surah: surah)
        app.userData.save(preset)
        app.userData.setLastPresetID(preset.id)
        app.notifyDataChanged()
        onSaved(preset)
    }
}

#Preview {
    NavigationStack {
        PresetBuilderView(route: .new(surahID: 55, range: VerseRange(start: 1, end: 5))) { _ in }
    }
    .environment(AppEnvironment.preview())
}
