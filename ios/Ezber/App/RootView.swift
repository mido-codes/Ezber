import SwiftUI

/// The five top-level destinations. The study player and pickers are pushed
/// from these stacks rather than living in their own tabs.
struct RootView: View {
    @Environment(AppEnvironment.self) private var app

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
            PresetLibraryView()
                .tabItem { Label("Library", systemImage: "books.vertical") }
            ProgressOverviewView()
                .tabItem { Label("Progress", systemImage: "chart.bar") }
            NotesView()
                .tabItem { Label("Notes", systemImage: "note.text") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .tint(Theme.accent)
        .preferredColorScheme(app.settings.themeMode.colorScheme)
        .environment(\.locale, Locale(identifier: app.settings.language.localeIdentifier))
    }
}

#Preview {
    RootView()
        .environment(AppEnvironment.preview())
}
