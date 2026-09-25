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
                VStack(alignment: .leading, spacing: EzberSpacing.x5) {
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
                .padding(EzberSpacing.screen)
            }
            .background(EzberColor.background.ignoresSafeArea())
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
        HStack(spacing: EzberSpacing.x3) {
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
        return VStack(alignment: .leading, spacing: EzberSpacing.x3) {
            Text("Progress glance")
                .font(EzberFont.bodyMedium)
                .foregroundStyle(EzberColor.foreground)
            HStack(spacing: EzberSpacing.x6) {
                GlanceMetric(value: "\(repetitions)", label: "repetitions")
                GlanceMetric(value: "\(progress.count)", label: "verses touched")
                GlanceMetric(value: "\(strong)", label: "strong")
            }
        }
        .ezberCard()
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
        VStack(alignment: .leading, spacing: EzberSpacing.x4) {
            EzberSectionHeading(
                eyebrow: "Continue",
                title: preset.name,
                description: surah.map { "\($0.nameLatin) \(preset.range.displayString)" }
            )

            HStack(spacing: EzberSpacing.x4) {
                Label("Verse \(positionInSection) of \(preset.range.count)", systemImage: "text.book.closed")
                Label("Repeat \(resume.repeatIndex) of \(preset.repeats.repeats(forVerse: resume.verseNumber))", systemImage: "repeat")
            }
            .font(EzberFont.caption)
            .foregroundStyle(EzberColor.mutedForeground)

            if let session, session.totalItems > 0 {
                EzberProgressBar(value: session.completionRatio)
            }

            Button(action: onContinue) {
                HStack(spacing: EzberSpacing.x2) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 20, weight: .semibold))
                    Text("Continue drill")
                }
            }
            .buttonStyle(EzberButtonStyle(tone: .primary, size: .large, expands: true))
        }
        .ezberCard()
    }
}

private struct WelcomeCard: View {
    let onStart: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: EzberSpacing.x4) {
            EzberSectionHeading(
                eyebrow: "Welcome",
                title: "Start a drill",
                description: "Choose a surah and a short section, set your repeats, and listen verse by verse."
            )
            Button(action: onStart) {
                HStack(spacing: EzberSpacing.x2) {
                    Image(systemName: "book")
                        .font(.system(size: 20, weight: .semibold))
                    Text("Choose a surah")
                }
            }
            .buttonStyle(EzberButtonStyle(tone: .primary, size: .large, expands: true))
        }
        .ezberCard()
    }
}

private struct QuickActionButton: View {
    let title: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: EzberSpacing.x2) {
                Image(systemName: systemImage)
                    .font(.system(size: 20))
                    .foregroundStyle(EzberColor.primary)
                Text(title)
                    .font(EzberFont.bodyMedium)
                    .foregroundStyle(EzberColor.foreground)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .ezberCard(padding: EzberSpacing.cardCompact)
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
                .font(EzberFont.title.monospacedDigit())
                .foregroundStyle(EzberColor.foreground)
            Text(LocalizedStringKey(label))
                .font(EzberFont.caption)
                .foregroundStyle(EzberColor.mutedForeground)
        }
    }
}

#Preview {
    HomeView()
        .environment(AppEnvironment.preview())
}
