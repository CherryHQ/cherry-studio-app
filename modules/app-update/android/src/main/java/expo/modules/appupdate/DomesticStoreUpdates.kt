package expo.modules.appupdate

import expo.modules.kotlin.Promise

internal interface DomesticStoreUpdates {
  fun check(id: String, store: String, promise: Promise)
  fun cancel(id: String)
  fun dispose()
}
