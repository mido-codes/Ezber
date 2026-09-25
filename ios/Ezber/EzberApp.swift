import SwiftUI

@main
struct EzberApp: App {
    @State private var environment = AppEnvironment.live()

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
