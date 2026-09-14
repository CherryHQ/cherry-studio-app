package expo.modules.cherryfilesharing

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class SharingFileProvider : FileProvider()

class FileSharingModule : Module() {
  private var pendingPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("CherryFileSharing")

    AsyncFunction("shareFiles") { urls: List<String>, mimeType: String, title: String, promise: Promise ->
      check(pendingPromise == null) { "Another share sheet is open." }
      require(urls.isNotEmpty()) { "At least one file is required." }
      val context = requireNotNull(appContext.reactContext)
      val root = File(context.cacheDir, "FileExports").canonicalPath + File.separator
      val uris = ArrayList(urls.map { value ->
        val url = Uri.parse(value)
        require(url.scheme == "file") { "Only local files can be shared." }
        val file = File(requireNotNull(url.path)).canonicalFile
        require(file.path.startsWith(root) && file.isFile && file.canRead()) { "The exported file is not readable." }
        FileProvider.getUriForFile(context, context.packageName + ".CherryFileSharingProvider", file)
      })
      val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
        setTypeAndNormalize(mimeType)
        putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
        clipData = ClipData.newRawUri(title, uris.first()).apply {
          uris.drop(1).forEach { addItem(ClipData.Item(it)) }
        }
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      pendingPromise = promise
      try {
        appContext.throwingActivity.startActivityForResult(Intent.createChooser(intent, title), REQUEST_CODE)
      } catch (error: Exception) {
        pendingPromise = null
        throw error
      }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, (requestCode) ->
      if (requestCode == REQUEST_CODE) {
        pendingPromise?.resolve(null)
        pendingPromise = null
      }
    }

    OnDestroy {
      pendingPromise?.reject("E_SHARING_CANCELLED", "The sharing module was closed.", null)
      pendingPromise = null
    }
  }

  companion object {
    private const val REQUEST_CODE = 8536
  }
}
