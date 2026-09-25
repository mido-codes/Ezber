import SwiftUI

/// Saved presets with one-tap play and rename / duplicate / edit / delete.
struct PresetLibraryView: View {
    @Environment(AppEnvironment.self) private var app
    @State private var path: [LibraryRoute] = []
    @State private var renameTarget: Preset?
    @State private var renameText = ""
    @State private var deleteTarget: Preset?

    enum LibraryRoute: Hashable {
        case builder(PresetBuilderRoute)
        case player(UUID)
    }

    var body: some View {
        let _ = app.dataRevision
        NavigationStack(path: $path) {
            List {
                ForEach(app.userData.allPresets()) { preset in
                    EzberPresetCard(
                        name: preset.name,
                        meta: meta(for: preset),
                        emphasized: app.userData.lastUsedPreset()?.id == preset.id
                    ) {
                        app.userData.setLastPresetID(preset.id)
                        app.notifyDataChanged()
                        path.append(.player(preset.id))
                    }
                    .listRowInsets(EdgeInsets(
                        top: EzberSpacing.x2,
                        leading: EzberSpacing.screen,
                        bottom: EzberSpacing.x2,
                        trailing: EzberSpacing.screen
                    ))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            deleteTarget = preset
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                    .contextMenu {
                        Button {
                            path.append(.builder(.edit(preset.id)))
                        } label: {
                            Label("Edit", systemImage: "slider.horizontal.3")
                        }
                        Button {
                            duplicate(preset)
                        } label: {
                            Label("Duplicate", systemImage: "plus.square.on.square")
                        }
                        Button {
                            renameTarget = preset
                            renameText = preset.name
                        } label: {
                            Label("Rename", systemImage: "pencil")
                        }
                        Button(role: .destructive) {
                            deleteTarget = preset
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(EzberColor.background)
            .overlay {
                if app.userData.allPresets().isEmpty {
                    EmptyStateView(
                        systemImage: "books.vertical",
                        title: "No presets yet",
                        message: "Build a drill from a surah and section to see it here."
                    )
                }
            }
            .navigationTitle("Presets")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        path.append(.builder(.new(surahID: nil, range: nil)))
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("New preset")
                }
            }
            .navigationDestination(for: LibraryRoute.self) { route in
                switch route {
                case .builder(let builderRoute):
                    PresetBuilderView(route: builderRoute) { preset in
                        if !path.isEmpty { path.removeLast() }
                        path.append(.player(preset.id))
                    }
                case .player(let presetID):
                    StudyPlayerView(presetID: presetID)
                }
            }
            .alert("Rename preset", isPresented: renamePresented) {
                TextField("Name", text: $renameText)
                Button("Save") { commitRename() }
                Button("Cancel", role: .cancel) { renameTarget = nil }
            }
            .confirmationDialog(
                "Delete preset?",
                isPresented: deletePresented,
                presenting: deleteTarget
            ) { preset in
                Button("Delete", role: .destructive) {
                    app.userData.deletePreset(id: preset.id)
                    app.notifyDataChanged()
                    deleteTarget = nil
                }
                Button("Cancel", role: .cancel) { deleteTarget = nil }
            } message: { preset in
                Text("\(preset.name) will be removed. Verse progress and notes are kept.")
            }
        }
    }

    private func meta(for preset: Preset) -> String {
        let reciter = app.content.reciter(id: preset.reciterID)?.name ?? preset.reciterID
        var meta = "\(preset.range.displayString) · ×\(preset.repeats.defaultRepeats) · \(reciter)"
        let overrideCount = preset.repeats.overrides.count
        if overrideCount > 0 {
            meta += " · \(overrideCount) override\(overrideCount == 1 ? "" : "s")"
        }
        return meta
    }

    private var renamePresented: Binding<Bool> {
        Binding(
            get: { renameTarget != nil },
            set: { presented in
                if !presented { renameTarget = nil }
            }
        )
    }

    private var deletePresented: Binding<Bool> {
        Binding(
            get: { deleteTarget != nil },
            set: { presented in
                if !presented { deleteTarget = nil }
            }
        )
    }

    private func commitRename() {
        guard var preset = renameTarget else { return }
        let trimmed = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            renameTarget = nil
            return
        }
        preset.name = trimmed
        preset.updatedAt = Date()
        app.userData.save(preset)
        app.notifyDataChanged()
        renameTarget = nil
    }

    private func duplicate(_ preset: Preset) {
        var copy = preset
        copy.id = UUID()
        copy.name = "\(preset.name) copy"
        copy.createdAt = Date()
        copy.updatedAt = Date()
        copy.lastStudiedAt = nil
        app.userData.save(copy)
        app.notifyDataChanged()
    }
}

#Preview {
    PresetLibraryView()
        .environment(AppEnvironment.preview())
}
