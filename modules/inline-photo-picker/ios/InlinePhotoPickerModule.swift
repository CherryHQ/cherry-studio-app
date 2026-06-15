import ExpoModulesCore

public final class InlinePhotoPickerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("InlinePhotoPicker")

    View(InlinePhotoPickerView.self) {
      Events("onSelectionChange", "onError", "onBackPress", "onConfirm", "onAllPhotosPress")

      Prop("selectionLimit") { (view: InlinePhotoPickerView, selectionLimit: Int?) in
        view.selectionLimit = max(0, selectionLimit ?? 0)
      }

      Prop("disabled") { (view: InlinePhotoPickerView, disabled: Bool?) in
        view.disabled = disabled ?? false
      }

      Prop("resetKey") { (view: InlinePhotoPickerView, resetKey: Int?) in
        view.resetKey = resetKey ?? 0
      }

      Prop("confirmLabelTemplate") { (view: InlinePhotoPickerView, template: String?) in
        view.confirmLabelTemplate = template ?? ""
      }

      Prop("backAccessibilityLabel") { (view: InlinePhotoPickerView, label: String?) in
        view.backAccessibilityLabel = label ?? ""
      }

      Prop("allPhotosLabel") { (view: InlinePhotoPickerView, label: String?) in
        view.allPhotosLabel = label ?? ""
      }
    }
  }
}
