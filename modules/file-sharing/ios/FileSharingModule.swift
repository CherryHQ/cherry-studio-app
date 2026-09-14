import ExpoModulesCore
import UIKit

public final class FileSharingModule: Module {
  private var isSharing = false

  public func definition() -> ModuleDefinition {
    Name("CherryFileSharing")

    AsyncFunction("shareFiles") { (urls: [URL], _: String, title: String, promise: Promise) in
      guard !self.isSharing else {
        throw Exception(name: "SharingInProgress", description: "Another share sheet is open.")
      }
      guard !urls.isEmpty, urls.allSatisfy({ $0.isFileURL && FileSystemUtilities.isReadableFile(self.appContext, $0) }) else {
        throw Exception(name: "UnreadableFiles", description: "Every shared file must be readable.")
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        throw Exception(name: "MissingPresenter", description: "No view controller is available.")
      }
      let controller = UIActivityViewController(activityItems: urls, applicationActivities: nil)
      controller.title = title
      controller.completionWithItemsHandler = { [weak self] _, _, _, _ in
        self?.isSharing = false
        // Dismissal does not tell the caller whether the files reached a recipient.
        promise.resolve(nil)
      }
      if let popover = controller.popoverPresentationController {
        popover.sourceView = presenter.view
        popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY, width: 0, height: 0)
      }
      self.isSharing = true
      presenter.present(controller, animated: true)
    }
    .runOnQueue(.main)
  }
}
