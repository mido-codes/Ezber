import SwiftUI

/// The most important screen: last-used preset with a large Continue control,
/// where the listener is in the section, a quick start, and a progress glance.
struct HomeView: View {
    @Environment(AppEnvironment.self) private var app
    @State private var path: [HomeRoute] = []

    enum HomeRoute: Hashable {
        case surahPicker
        case sectionPicker(surahID: Int)
        case presetBuilder(PresetBuilderRoute)
        case studyPlayer(UUID)
        case reciterPicker
    }

    var body: some View {
        let _ = app.dataRevision
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let preset = app.userData.lastUsedPreset() {
                        ContinueCard(
                            preset: preset,
                            surah: app.content.surah(id: preset.surahID),
                            session: app.userData.activeSession(for: preset.id)
                        ) {
                            app.userData.setLastPresetID(preset.id)
                            app.notifyDataChanged()
                            path.append(.studyPlayer(preset.id))
                        }
                    } else {
                        WelcomeCard {
                            path.append(.surahPicker)
                        }
                    }

                    quickActions
                    progressGlance
                }
                .padding()
            }
            .background(Theme.warmBackground.ignoresSafeArea())
            .navigationTitle("Ezber")
            .navigationDestination(for: HomeRoute.self) { route in
                destination(for: route)
            }
        }
    }

    @ViewBuilder
    private func destination(for route: HomeRoute) -> some View {
        switch route {
        case .surahPicker:
            SurahPickerView { surah in
                path.append(.sectionPicker(surahID: surah.id))
            }
        case .sectionPicker(let surahID):
            SectionPickerView(surahID: surahID) { surah, range in
                path.append(.presetBuilder(.new(surahID: surah.id, range: range)))
            }
        case .presetBuilder(let builderRoute):
            PresetBuilderView(route: builderRoute) { preset in
                if !path.isEmpty { path.removeLast() }
                path.append(.studyPlayer(preset.id))
            }
        case .studyPlayer(let presetID):
            StudyPlayerView(presetID: presetID)
        case .reciterPicker:
            ReciterPickerView(selectedID: app.settings.defaultReciterID) { reciter in
                app.settings.defaultReciterID = reciter.id
                app.settings.persist()
                path.removeLast()
            }
        }
    }

    private var quickActions: some View {
        HStack(spacing: 12) {
            QuickActionButton(title: "New drill", systemImage: "plus.circle") {
                path.append(.surahPicker)
            }
            QuickActionButton(title: "Reciters", systemImage: "music.mic") {
                path.append(.reciterPicker)
            }
        }
    }

    private var progressGlance: some View {
        let progress = app.userData.allProgress()
        let repetitions = progress.reduce(0) { $0 + $1.repetitionsCompleted }
        let strong = progress.filter { $0.state == .strong }.count
        return VStack(alignment: .leading, spacing: 12) {
            Text("Progress glance")
                .font(.headline)
            HStack(spacing: 24) {
                GlanceMetric(value: "\(repetitions)", label: "repetitions")
                GlanceMetric(value: "\(progress.count)", label: "verses touched")
                GlanceMetric(value: "\(strong)", label: "strong")
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.cardBackground, in: RoundedRectangle(cornerRadius: 20))
    }
}

private struct ContinueCard: View {
    let preset: Preset
    let surah: Surah?
    let session: StudySession?
    let onContinue: () -> Void

    private var resume: ResumePoint {
        session?.resumePoint ?? ResumePoint(verseNumber: preset.range.start, repeatIndex: 1)
    }

    private var positionInSection: Int {
        max(1, resume.verseNumber - preset.range.start + 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Continue")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 4) {
                Text(preset.name)
                    .font(.title2.weight(.semibold))
                if let surah {
                    Text("\(surah.nameLatin) \(preset.range.displayString)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 16) {
                Label("Verse \(positionInSection) of \(preset.range.count)", systemImage: "text.book.closed")
                Label("Repeat \(resume.repeatIndex) of \(preset.repeats.repeats(forVerse: resume.verseNumber))", systemImage: "repeat")
            }
            .font(.footnote)
            .foregroundStyle(.secondary)

            if let session, session.totalItems > 0 {
                ProgressView(value: session.completionRatio)
                    .tint(Theme.accent)
            }

            Button(action: onContinue) {
                Label("Continue drill", systemImage: "play.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent)
        }
        .padding(20)
        .background(Theme.cardBackground, in: RoundedRectangle(cornerRadius: 20))
    }
}

private struct WelcomeCard: View {
    let onStart: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Welcome")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            Text("Start a drill")
                .font(.title2.weight(.semibold))
            Text("Choose a surah and a short section, set your repeats, and listen verse by verse.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Button(action: onStart) {
                Label("Choose a surah", systemImage: "book")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent)
        }
        .padding(20)
        .background(Theme.cardBackground, in: RoundedRectangle(cornerRadius: 20))
    }
}

private struct QuickActionButton: View {
    let title: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: systemImage)
                    .font(.title3)
                Text(title)
                    .font(.subheadline.weight(.medium))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Theme.cardBackground, in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }
}

private struct GlanceMetric: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.title3.monospacedDigit().weight(.semibold))
            Text(LocalizedStringKey(label))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    HomeView()
        .environment(AppEnvironment.preview())
}
