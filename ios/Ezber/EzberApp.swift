import SwiftUI

@main
struct EzberApp: App {
    @State private var environment = AppEnvironment.live()

    init() {
        // The design system's OFL fonts are registered from the bundle at
        // launch; no Info.plist UIAppFonts entry is needed.
        EzberFont.registerBundledFonts()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(environment)
                .task {
                    environment.bootstrap()
                }
        }
    }
}
