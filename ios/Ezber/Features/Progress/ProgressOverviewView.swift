import SwiftUI

/// Honest exposure: per-surah repetition counts, per-verse states, and a gentle
/// "what to drill next".
struct ProgressOverviewView: View {
    @Environment(AppEnvironment.self) private var app
    @State private var path: [ProgressRoute] = []

    enum ProgressRoute: Hashable {
        case verseDetail(VerseID)
        case builder(PresetBuilderRoute)
        case player(UUID)
    }

    private struct SurahSection: Identifiable {
        let surah: Surah
        let entries: [VerseProgress]

        var id: Int { surah.id }
        var totalRepetitions: Int { entries.reduce(0) { $0 + $1.repetitionsCompleted } }
    }

    private struct StateCount: Identifiable {
        let state: VerseState
        let count: Int

        var id: String { state.rawValue }
    }

    var body: some View {
        let _ = app.dataRevision
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    summaryCard
                    nextUpCard
                    if sections.isEmpty {
                        EmptyStateView(
                            systemImage: "chart.bar",
                            title: "No progress yet",
                            message: "Drill a section and your per-verse exposure will appear here."
                        )
                    } else {
                        ForEach(sections) { section in
                            surahCard(section)
                        }
                    }
                }
                .padding()
            }
            .background(Theme.warmBackground.ignoresSafeArea())
            .navigationTitle("Progress")
            .navigationDestination(for: ProgressRoute.self) { route in
                switch route {
                case .verseDetail(let verseID):
                    VerseProgressDetailView(verseID: verseID) { surah, range in
                        path.append(.builder(.new(surahID: surah.id, range: range)))
                    }
                case .builder(let builderRoute):
                    PresetBuilderView(route: builderRoute) { preset in
                        if !path.isEmpty { path.removeLast() }
                        path.append(.player(preset.id))
                    }
                case .player(let presetID):
                    StudyPlayerView(presetID: presetID)
                }
            }
        }
    }

    private var progressEntries: [VerseProgress] {
        app.userData.allProgress()
    }

    private var sections: [SurahSection] {
        let grouped = Dictionary(grouping: progressEntries) { $0.verseID.surah }
        return grouped.compactMap { surahID, entries in
            guard let surah = app.content.surah(id: surahID) else { return nil }
            return SurahSection(
                surah: surah,
                entries: entries.sorted { $0.verseID.number < $1.verseID.number }
            )
        }
        .sorted { $0.surah.id < $1.surah.id }
    }

    private var summaryCard: some View {
        let entries = progressEntries
        let repetitions = entries.reduce(0) { $0 + $1.repetitionsCompleted }
        let stateCounts = VerseState.allCases.map { state in
            StateCount(state: state, count: entries.filter { $0.state == state }.count)
        }
        return VStack(alignment: .leading, spacing: 12) {
            Text("What has been drilled")
                .font(.headline)
            HStack(spacing: 24) {
                metric("\(repetitions)", label: "repetitions")
                metric("\(entries.count)", label: "verses touched")
                metric("\(stateCounts.first { $0.state == .strong }?.count ?? 0)", label: "strong")
            }
            HStack(spacing: 12) {
                ForEach(stateCounts) { item in
                    HStack(spacing: 4) {
                        Circle()
                            .fill(item.state.color)
                            .frame(width: 8, height: 8)
                        Text("\(item.count) \(item.state.label.lowercased())")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.cardBackground, in: RoundedRectangle(cornerRadius: 20))
    }

    @ViewBuilder
    private var nextUpCard: some View {
        if let candidate = progressEntries.min(by: { lhs, rhs in
            if lhs.repetitionsCompleted == rhs.repetitionsCompleted {
                return lhs.verseID < rhs.verseID
            }
            return lhs.repetitionsCompleted < rhs.repetitionsCompleted
        }) {
            VStack(alignment: .leading, spacing: 12) {
                Text("What to drill next")
                    .font(.headline)
                Text("\(candidate.verseID.reference) has \(candidate.repetitionsCompleted) repetitions so far.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button {
                    if let surah = app.content.surah(id: candidate.verseID.surah) {
                        path.append(.builder(.new(
                            surahID: surah.id,
                            range: VerseRange(start: candidate.verseID.number, end: candidate.verseID.number)
                        )))
                    }
                } label: {
                    Label("Drill this verse", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.accent)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.cardBackground, in: RoundedRectangle(cornerRadius: 20))
        }
    }

    private func metric(_ value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.title3.monospacedDigit().weight(.semibold))
            Text(LocalizedStringKey(label))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func surahCard(_ section: SurahSection) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(section.surah.nameLatin)
                    .font(.headline)
                Spacer()
                Text("\(section.totalRepetitions) repetitions")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(section.entries) { entry in
                Button {
                    path.append(.verseDetail(entry.verseID))
                } label: {
                    HStack {
                        Text(entry.verseID.reference)
                            .font(.subheadline.monospacedDigit())
                        StateBadge(state: entry.state)
                        Spacer()
                        Text("\(entry.repetitionsCompleted)×")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                        Image(systemName: "chevron.right")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if entry.id != section.entries.last?.id {
                    Divider()
                }
            }
        }
        .padding(20)
        .background(Theme.cardBackground, in: RoundedRectangle(cornerRadius: 20))
    }
}

#Preview {
    ProgressOverviewView()
        .environment(AppEnvironment.preview())
}
