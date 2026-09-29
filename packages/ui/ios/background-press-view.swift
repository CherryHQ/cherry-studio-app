import NitroModules
import UIKit

final class HybridCherryBackgroundPressView: HybridCherryBackgroundPressViewSpec {
    private let container = BackgroundPressView()
    var view: UIView { container }
    var mode: BackgroundPressMode = .background {
        didSet { container.mode = mode }
    }
    var enabled: Bool = false {
        didSet { container.recognitionEnabled = enabled }
    }
    var onBackgroundPress: () -> Void = {} {
        didSet { container.onBackgroundPress = onBackgroundPress }
    }
}

/// Fabric mounts React children beside the Nitro content view, not inside it. Like CherryMenuView,
/// this view passes hits through and installs recognition on its component host, which is the
/// common ancestor of those children.
private final class BackgroundPressView: UIView, UIGestureRecognizerDelegate {
    /// Component hosts of mounted areas and exclusions. The nearest one owns a touch.
    private static let owners = NSMapTable<UIView, BackgroundPressView>.weakToWeakObjects()

    var mode: BackgroundPressMode = .background {
        didSet { updateRecognition() }
    }
    var recognitionEnabled = false {
        didSet { updateRecognition() }
    }
    var onBackgroundPress: () -> Void = {}

    private lazy var tap = UITapGestureRecognizer(target: self, action: #selector(press))
    private let longPress = UILongPressGestureRecognizer()
    private weak var host: UIView?

    override init(frame: CGRect) {
        super.init(frame: frame)
        for recognizer in [tap, longPress] as [UIGestureRecognizer] {
            recognizer.cancelsTouchesInView = false
            recognizer.delaysTouchesBegan = false
            recognizer.delaysTouchesEnded = false
            recognizer.delegate = self
        }
        tap.require(toFail: longPress)
        updateRecognition()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func didMoveToSuperview() {
        super.didMoveToSuperview()
        attach(to: superview)
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        // The content view sits above the host's React children; it must never own a hit.
        nil
    }

    private func attach(to nextHost: UIView?) {
        guard host !== nextHost else { return }
        if let host {
            if Self.owners.object(forKey: host) === self { Self.owners.removeObject(forKey: host) }
            host.removeGestureRecognizer(tap)
            host.removeGestureRecognizer(longPress)
        }
        host = nextHost
        guard let nextHost else { return }
        Self.owners.setObject(self, forKey: nextHost)
        nextHost.addGestureRecognizer(tap)
        nextHost.addGestureRecognizer(longPress)
    }

    private func updateRecognition() {
        let enabled = recognitionEnabled && mode == .background
        if tap.isEnabled != enabled { tap.isEnabled = enabled }
        if longPress.isEnabled != enabled { longPress.isEnabled = enabled }
    }

    @objc private func press() {
        if tap.state == .ended && recognitionEnabled && mode == .background { onBackgroundPress() }
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        var target = touch.view
        while let view = target, view !== host {
            // A nearer area or exclusion owns this touch.
            if Self.owners.object(forKey: view) != nil { return false }
            // A touch that stops momentum or joins a drag is not a background tap.
            if let scroll = view as? UIScrollView, scroll.isDragging || scroll.isDecelerating {
                return false
            }
            target = view.superview
        }
        return target != nil
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRequireFailureOf otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        otherGestureRecognizer is UIPanGestureRecognizer
    }
}
