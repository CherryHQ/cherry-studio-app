import ExpoModulesCore

public final class InlinePhotoPickerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("InlinePhotoPicker")

    View(InlinePhotoPickerView.self) {
      Events("onSelectionChange", "onError")

      Prop("selectionLimit") { (view: InlinePhotoPickerView, selectionLimit: Int?) in
        view.selectionLimit = max(0, selectionLimit ?? 0)
      }

      Prop("disabled") { (view: InlinePhotoPickerView, disabled: Bool?) in
        view.disabled = disabled ?? false
      }

      Prop("resetKey") { (view: InlinePhotoPickerView, resetKey: Int?) in
        view.resetKey = resetKey ?? 0
      }
    }
  }
}
