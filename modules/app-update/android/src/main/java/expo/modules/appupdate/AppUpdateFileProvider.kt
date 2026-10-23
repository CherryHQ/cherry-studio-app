package expo.modules.appupdate

import androidx.core.content.FileProvider

/** A distinct provider class prevents manifest merging with unrelated file-sharing providers. */
class AppUpdateFileProvider : FileProvider()
