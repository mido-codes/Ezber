import SwiftUI

/// Reciters with name, style, language and a short sample. Sample playback is
/// stubbed; the row shows a temporary "playing" state so the interaction reads.
struct ReciterPickerView: View {
    @Environment(AppEnvironment.self) private var app

    let selectedID: String?
    let onSelect: (Reciter) -> Void

    @State private var samplingID: String?

    var body: some View {
        List(app.content.allReciters()) { reciter in
            HStack(spacing: EzberSpacing.x3) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(reciter.name)
                        .font(EzberFont.bodyMedium)
                        .foregroundStyle(EzberColor.foreground)
                    Text("\(reciter.style) · \(reciter.languageName)")
                        .font(EzberFont.caption)
                        .foregroundStyle(EzberColor.mutedForeground)
                    Text(downloadLabel(for: reciter))
                        .font(EzberFont.micro)
                        .foregroundStyle(downloadColor(for: reciter))
                }
                Spacer()
                Button {
                    toggleSample(reciter)
                } label: {
                    Image(systemName: samplingID == reciter.id ? "stop.circle" : "play.circle")
                        .font(.title3)
                        .foregroundStyle(EzberColor.primary)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Play sample from \(reciter.name)")

                if reciter.id == selectedID {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(EzberColor.primary)
                }
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
            .onTapGesture {
                onSelect(reciter)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(EzberColor.background)
        .navigationTitle("Reciters")
        .navigationBarTitleDisplayMode(.inline)
        .tint(EzberColor.primary)
    }

    private func downloadLabel(for reciter: Reciter) -> LocalizedStringKey {
        let state = app.userData.downloadState(reciterID: reciter.id, surahID: 0)
        return state == .downloaded ? "Sample downloaded" : "Sample not downloaded"
    }

    private func downloadColor(for reciter: Reciter) -> Color {
        let state = app.userData.downloadState(reciterID: reciter.id, surahID: 0)
        return state.color
    }

    private func toggleSample(_ reciter: Reciter) {
        if samplingID == reciter.id {
            samplingID = nil
            return
        }
        samplingID = reciter.id
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if samplingID == reciter.id {
                samplingID = nil
            }
        }
    }
}

#Preview {
    NavigationStack {
        ReciterPickerView(selectedID: "dhikr-al-huda") { _ in }
    }
    .environment(AppEnvironment.preview())
}
