import SwiftUI

@main
struct EzberApp: App {
    @State private var environment: AppEnvironment

    init() {
        let environment = AppEnvironment.live()
        // CarPlay connects to its own UIScene; the runtime registry hands the
        // CarPlay scene this same environment so both surfaces share one drill
        // session, one audio session and one user-data store.
        CarPlayRuntime.register(environment)
        _environment = State(initialValue: environment)
    }

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
