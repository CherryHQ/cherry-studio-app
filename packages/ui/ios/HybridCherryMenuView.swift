// Native menu behavior adapted from react-native-nitro-contextmenu and
// react-native-nitro-menu. See packages/ui/third-party-notices.md.
import NitroModules
import UIKit

final class HybridCherryMenuView: HybridCherryMenuViewSpec {
    private let containerView = CherryMenuContainerView()

    var view: UIView { containerView }

    var items: [NativeMenuItem] = [] {
        didSet { containerView.items = items }
    }

    var onAction: (String) -> Void = { _ in } {
        didSet { containerView.onAction = onAction }
    }

    var trigger: NativeMenuTrigger = .tap {
        didSet { containerView.trigger = trigger }
    }

    func getLongPressMinDuration() throws -> Double {
        // Android is the only caller; iOS long press stays UIKit-owned.
        0
    }

    func getLongPressMaxDistance() throws -> Double {
        // Android is the only caller; iOS long press stays UIKit-owned.
        0
    }

    func showMenu() throws {
        // iOS recognition stays system-owned: tap menus present through the UIButton primary
        // action and long-press menus through UIContextMenuInteraction, which cannot be
        // presented programmatically. Android is the only caller of this method.
    }
}

private final class CherryMenuContainerView: UIView, UIContextMenuInteractionDelegate {
    var items: [NativeMenuItem] = [] {
        didSet { rebuildTapMenu() }
    }

    var onAction: (String) -> Void = { _ in } {
        didSet { rebuildTapMenu() }
    }

    var trigger: NativeMenuTrigger = .tap {
        didSet {
            guard trigger != oldValue else { return }
            updateTriggerMode()
        }
    }

    private var interaction: UIContextMenuInteraction?
    private weak var interactionHost: UIView?
    private var menuButton: UIButton?

    override init(frame: CGRect) {
        super.init(frame: frame)
        installTapButton()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        installTapButton()
    }

    deinit {
        detachInteraction()
    }

    override func didMoveToSuperview() {
        super.didMoveToSuperview()
        syncInteraction()
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hitView = super.hitTest(point, with: event)
        return trigger == .longpress && hitView === self ? nil : hitView
    }

    private func updateTriggerMode() {
        switch trigger {
        case .tap:
            detachInteraction()
            installTapButton()
        case .longpress:
            menuButton?.removeFromSuperview()
            menuButton = nil
            syncInteraction()
        }
    }

    private func installTapButton() {
        guard menuButton == nil else {
            rebuildTapMenu()
            return
        }

        let button = UIButton(type: .system)
        button.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        button.backgroundColor = .clear
        button.frame = bounds
        button.isAccessibilityElement = false
        button.showsMenuAsPrimaryAction = true
        addSubview(button)
        menuButton = button
        rebuildTapMenu()
    }

    private func rebuildTapMenu() {
        guard trigger == .tap else { return }
        menuButton?.menu = makeMenu()
    }

    private func syncInteraction() {
        guard trigger == .longpress, let host = superview else {
            detachInteraction()
            return
        }

        guard interactionHost !== host else { return }
        detachInteraction()

        let nextInteraction = UIContextMenuInteraction(delegate: self)
        host.addInteraction(nextInteraction)
        interaction = nextInteraction
        interactionHost = host
    }

    private func detachInteraction() {
        if let interaction, let interactionHost {
            interactionHost.removeInteraction(interaction)
        }
        interaction = nil
        interactionHost = nil
    }

    /// Resolves the contract's semantic icon token to this platform's artwork.
    private func makeImage(for icon: NativeMenuIcon) -> UIImage? {
        switch icon {
        case .none:
            return nil
        case .branch:
            return UIImage(systemName: "arrow.triangle.branch")
        }
    }

    private func makeMenu() -> UIMenu {
        let actions = items.map { item in
            var attributes: UIMenuElement.Attributes = []
            if item.destructive {
                attributes.insert(.destructive)
            }
            if item.disabled {
                attributes.insert(.disabled)
            }

            let state: UIMenuElement.State
            switch item.checked {
            case .none, .off:
                state = .off
            case .on:
                state = .on
            }

            return UIAction(
                title: item.label,
                image: makeImage(for: item.icon),
                identifier: UIAction.Identifier(item.id),
                attributes: attributes,
                state: state
            ) { [weak self] _ in
                self?.onAction(item.id)
            }
        }

        return UIMenu(children: actions)
    }

    func contextMenuInteraction(
        _ interaction: UIContextMenuInteraction,
        configurationForMenuAtLocation location: CGPoint
    ) -> UIContextMenuConfiguration? {
        guard !items.isEmpty else { return nil }

        return UIContextMenuConfiguration(
            identifier: nil,
            previewProvider: nil,
            actionProvider: { [weak self] _ in self?.makeMenu() }
        )
    }
}
