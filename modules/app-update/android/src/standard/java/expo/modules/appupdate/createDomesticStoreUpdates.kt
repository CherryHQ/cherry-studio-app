package expo.modules.appupdate

import android.content.Context

@Suppress("UNUSED_PARAMETER")
internal fun createDomesticStoreUpdates(context: Context): DomesticStoreUpdates =
  error("Domestic stores are disabled for this distribution")
