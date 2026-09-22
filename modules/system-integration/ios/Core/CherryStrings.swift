import Foundation

struct CherryStrings {
  subscript(_ key: String) -> String {
    NSLocalizedString(key, tableName: "SystemIntegration", bundle: .main,
      value: Self.fallback[key] ?? Self.fallback["failed"]!, comment: "")
  }

  private static let fallback = [
    "close": "Close",
    "failed": "The share failed. Open Cherry and try again.",
    "shareTitle": "Share to Cherry", "shareSave": "Save for Cherry",
    "shareSaved": "Saved. Open Cherry to choose an Agent and review the content before sending.",
    "sharePreparing": "Preparing shared content…",
    "shareFailed": "Could not read this share. Share up to 10 files (25 MB each, 50 MB total) and try again."
  ]
}
