package expo.modules.systemintegration

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ShareReceiverActivity : Activity() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
  private var dialog: AlertDialog? = null
  @Volatile private var stagedId: String? = null
  private var transferred = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    if (savedInstanceState != null || intent.action !in listOf(Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE)) { finish(); return }
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
      ?: intent.clipData?.let { clip -> (0 until clip.itemCount).mapNotNull { index ->
        val item = clip.getItemAt(index)
        item.text?.toString() ?: item.uri?.takeIf { it.scheme in listOf("http", "https") }?.toString()
      }.joinToString("\n\n") }.orEmpty()
    val uris = receiveUris(intent)
    // No source content is staged until the user confirms the share.
    dialog = AlertDialog.Builder(this)
      .setTitle(R.string.cherry_share_title)
      .setMessage(R.string.cherry_share_confirm)
      .setNegativeButton(R.string.cherry_share_close) { _, _ -> finish() }
      .setPositiveButton(R.string.cherry_share_continue) { _, _ -> stage(text, uris) }
      .setOnCancelListener { finish() }
      .show()
  }

  @Suppress("DEPRECATION")
  private fun receiveUris(intent: Intent): List<Uri> {
    val streams = if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
      intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
    } else listOfNotNull(intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))
    if (streams.isNotEmpty()) return streams.distinct()
    val clip = intent.clipData ?: return emptyList()
    return (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri?.takeIf { uri -> uri.scheme == "content" } }.distinct()
  }

  private fun stage(text: String, uris: List<Uri>) {
    dialog = AlertDialog.Builder(this).setMessage(R.string.cherry_share_preparing)
      .setNegativeButton(R.string.cherry_share_close) { _, _ -> finish() }
      .setOnCancelListener { finish() }.show()
    scope.launch {
      try {
        val activityScope = scope
        val id = withContext(Dispatchers.IO) {
          val staged = SystemEntryStore.stageShare(applicationContext, text, uris) { !activityScope.isActive }
          stagedId = staged
          if (!activityScope.isActive) {
            SystemEntryStore.complete(applicationContext, staged)
            throw CancellationException()
          }
          staged
        }
        if (!isActive || isFinishing) {
          withContext(Dispatchers.IO) { SystemEntryStore.complete(applicationContext, id) }
          return@launch
        }
        val launch = packageManager.getLaunchIntentForPackage(packageName)
          ?: throw IllegalStateException("Application entry is unavailable")
        startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        transferred = true
        setIntent(Intent())
        finish()
      } catch (_: CancellationException) {
        // onDestroy cleans any share that was not transferred.
      } catch (_: Exception) {
        dialog?.dismiss()
        dialog = AlertDialog.Builder(this@ShareReceiverActivity).setMessage(R.string.cherry_share_failed)
          .setPositiveButton(R.string.cherry_share_close) { _, _ -> finish() }
          .setOnCancelListener { finish() }.show()
      }
    }
  }

  override fun onSaveInstanceState(outState: Bundle) { outState.putBoolean("closed", true) }

  override fun onDestroy() {
    scope.cancel()
    dialog?.dismiss()
    dialog = null
    if (!transferred) stagedId?.let { SystemEntryStore.complete(applicationContext, it) }
    stagedId = null
    setIntent(Intent())
    super.onDestroy()
  }
}
