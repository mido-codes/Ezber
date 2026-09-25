import SwiftUI

/// Display, audio, language, storage and about. Defaults here feed new presets;
/// the language picker switches the interface locale.
struct SettingsView: View {
    @Environment(AppEnvironment.self) private var app
    @State private var showReciterPicker = false
    @State private var showCredits = false

    var body: some View {
        let _ = app.dataRevision
        @Bindable var settings = app.settings
        NavigationStack {
            Form {
                Section("Display") {
                    Picker("Theme", selection: $settings.themeMode) {
                        ForEach(AppSettings.ThemeMode.allCases) { mode in
                            Text(LocalizedStringKey(mode.label)).tag(mode)
                        }
                    }
                    Toggle("Arabic script by default", isOn: $settings.defaultShowArabic)
                    Picker("Transliteration style", selection: $settings.defaultTransliterationStyle) {
                        ForEach(TransliterationStyle.allCases) { style in
                            Text(LocalizedStringKey(style.label)).tag(style)
                        }
                    }
                    Picker("Translation", selection: $settings.defaultTranslationMode) {
                        ForEach(TranslationMode.allCases) { mode in
                            Text(LocalizedStringKey(mode.label)).tag(mode)
                        }
                    }
                }

                Section("Audio") {
                    Button {
                        showReciterPicker = true
                    } label: {
                        HStack {
                            Text("Default reciter")
                                .foregroundStyle(.primary)
                            Spacer()
                            Text(defaultReciterName)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Picker("Navigation prompts", selection: $settings.navigationBehavior) {
                        ForEach(AppSettings.NavigationBehavior.allCases) { behavior in
                            Text(LocalizedStringKey(behavior.label)).tag(behavior)
                        }
                    }
                    Picker("Phone calls", selection: $settings.callBehavior) {
                        ForEach(AppSettings.CallBehavior.allCases) { behavior in
                            Text(LocalizedStringKey(behavior.label)).tag(behavior)
                        }
                    }
                    Toggle("Loop until stopped by default", isOn: $settings.defaultLoopUntilStopped)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Pause between repeats: \(settings.defaultPauseBetweenRepeats, specifier: "%.1f")s")
                        Slider(value: $settings.defaultPauseBetweenRepeats, in: 0...5, step: 0.5)
                    }
                }

                Section("Language") {
                    Picker("Interface language", selection: $settings.language) {
                        ForEach(AppSettings.Language.allCases) { language in
                            Text(language.label).tag(language)
                        }
                    }
                }

                Section("Storage and downloads") {
                    if downloads.isEmpty {
                        Text("No downloads yet. Downloaded surahs will be listed here.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(downloads) { download in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(reciterName(for: download))
                                    Text("Surah \(download.surahID)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(LocalizedStringKey(download.state.label))
                                    .font(.caption)
                                    .foregroundStyle(download.state.color)
                            }
                        }
                    }
                    InfoRow(title: "Content store", value: app.contentStoreDescription)
                    InfoRow(title: "User store", value: app.userStoreDescription)
                    Button("Export user data (stub)") {}
                        .disabled(true)
                }

                Section("About") {
                    InfoRow(title: "Version", value: appVersion)
                    Button {
                        showCredits = true
                    } label: {
                        HStack {
                            Text("Credits and licenses")
                                .foregroundStyle(.primary)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                    InfoRow(title: "Content", value: "Placeholder data")
                }
            }
            .navigationTitle("Settings")
            .sheet(isPresented: $showReciterPicker) {
                NavigationStack {
                    ReciterPickerView(selectedID: app.settings.defaultReciterID) { reciter in
                        app.settings.defaultReciterID = reciter.id
                        app.settings.persist()
                        showReciterPicker = false
                    }
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { showReciterPicker = false }
                        }
                    }
                }
            }
            .navigationDestination(isPresented: $showCredits) {
                CreditsView()
            }
        }
        .onChange(of: settings.persistenceToken) { _, _ in
            settings.persist()
        }
    }

    private var downloads: [Download] {
        app.userData.allDownloads()
    }

    private var defaultReciterName: String {
        app.content.reciter(id: app.settings.defaultReciterID)?.name ?? "None"
    }

    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }

    private func reciterName(for download: Download) -> String {
        app.content.reciter(id: download.reciterID)?.name ?? download.reciterID
    }
}

#Preview {
    SettingsView()
        .environment(AppEnvironment.preview())
}
