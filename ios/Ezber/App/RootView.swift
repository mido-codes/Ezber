import SwiftUI

/// The five top-level destinations. The study player and pickers are pushed
/// from these stacks rather than living in their own tabs.
struct RootView: View {
    @Environment(AppEnvironment.self) private var app

    var body: some View {
        // TODO(open-call: tab-shell): the kit's floating 4-tab bar vs the
        // scaffold's native 5-tab TabView is one of the three open captain
        // calls (report §8). The visual port only re-tints the native shell;
        // the tab shape and order are deliberately unchanged.
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
        .tint(EzberColor.primary)
        .preferredColorScheme(app.settings.themeMode.colorScheme)
        .environment(\.locale, Locale(identifier: app.settings.language.localeIdentifier))
    }
}

#Preview {
    RootView()
        .environment(AppEnvironment.preview())
}
