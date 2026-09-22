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
    var onBackgroundInteraction: (BackgroundPressPhase) -> Void = { _ in } {
        didSet { container.onBackgroundInteraction = onBackgroundInteraction }
    }
}

private final class BackgroundPressView: UIView, UIGestureRecognizerDelegate {
    var mode: BackgroundPressMode = .background {
        didSet { updateRecognition() }
    }
    var recognitionEnabled = false {
        didSet { updateRecognition() }
    }
    var onBackgroundInteraction: (BackgroundPressPhase) -> Void = { _ in }

    private lazy var tap = UITapGestureRecognizer(target: self, action: #selector(press))
    private let longPress = UILongPressGestureRecognizer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        let recognizers: [UIGestureRecognizer] = [tap, longPress]
        for recognizer in recognizers {
            recognizer.cancelsTouchesInView = false
            recognizer.delaysTouchesBegan = false
            recognizer.delaysTouchesEnded = false
            recognizer.delegate = self
            addGestureRecognizer(recognizer)
        }
        tap.require(toFail: longPress)
        updateRecognition()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    private func updateRecognition() {
        let enabled = recognitionEnabled && mode == .background
        if tap.isEnabled != enabled { tap.isEnabled = enabled }
        if longPress.isEnabled != enabled { longPress.isEnabled = enabled }
    }

    @objc private func press() {
        if tap.state == .ended && recognitionEnabled { onBackgroundInteraction(.press) }
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        if gestureRecognizer === tap { onBackgroundInteraction(.start) }
        var target = touch.view
        while let view = target, view !== self {
            if view is BackgroundPressView { return false }
            if let scroll = view as? UIScrollView, scroll.isDragging || scroll.isDecelerating {
                return false
            }
            target = view.superview
        }
        return true
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRequireFailureOf otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        otherGestureRecognizer is UIPanGestureRecognizer
    }
}
