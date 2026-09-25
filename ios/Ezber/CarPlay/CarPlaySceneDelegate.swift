import CarPlay
import UIKit

/// Entry point for the CarPlay audio scene.
///
/// `Info.plist` names this class as the delegate for
/// `CPTemplateApplicationSceneSessionRoleApplication`, so UIKit instantiates it
/// when a head unit connects and releases it when the session ends. The
/// coordinator owns the template hierarchy from then on.
@MainActor
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private var coordinator: CarPlayCoordinator?

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController,
        to window: CPWindow
    ) {
        let coordinator = CarPlayCoordinator(
            environment: CarPlayRuntime.resolveEnvironment(),
            interfaceController: interfaceController
        )
        self.coordinator = coordinator
        coordinator.start()
    }

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnect interfaceController: CPInterfaceController,
        from window: CPWindow
    ) {
        coordinator?.stop()
        coordinator = nil
    }
}
