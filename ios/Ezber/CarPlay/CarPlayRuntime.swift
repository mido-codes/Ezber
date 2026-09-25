import Foundation

/// Shared-environment registry for the CarPlay scene.
///
/// SwiftUI creates the app's `AppEnvironment` in `EzberApp`; CarPlay connects
/// to a separate `UIScene`, so its delegate has no direct route to that
/// instance. `EzberApp.init()` registers the environment here and the CarPlay
/// scene resolves it, which keeps one audio session, one drill session and one
/// user-data store across the phone and the car.
///
/// The fallback exists only for the case where the system launches the app
/// straight into a CarPlay session before the phone scene connects.
enum CarPlayRuntime {
    private static weak var registeredEnvironment: AppEnvironment?

    static func register(_ environment: AppEnvironment) {
        registeredEnvironment = environment
    }

    static func resolveEnvironment() -> AppEnvironment {
        let environment: AppEnvironment
        if let registeredEnvironment {
            environment = registeredEnvironment
        } else {
            environment = AppEnvironment.live()
            registeredEnvironment = environment
        }
        environment.bootstrap()
        return environment
    }
}
