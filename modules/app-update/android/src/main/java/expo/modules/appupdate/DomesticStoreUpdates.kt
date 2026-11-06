package expo.modules.appupdate

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.honor.updater.upsdk.api.UpdateCallAPI
import com.xiaomi.market.sdk.UpdateStatus
import com.xiaomi.market.sdk.XiaomiUpdateAgent
import expo.modules.kotlin.Promise
import java.util.concurrent.Executors

private typealias StoreResult = Map<String, Any?>

private fun unavailable(reason: String, vendorCode: Int? = null): StoreResult =
  mapOf("status" to "unavailable", "reason" to reason, "vendorCode" to vendorCode)

/** Query-only vendor integration. Store navigation and installation are separate user actions. */
internal class DomesticStoreUpdates(private val context: Context) {
  private val handler = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor()
  private val pending = mutableMapOf<String, Request>()
  private var disposed = false

  private class Request(val promise: Promise, val store: String, val timeout: Runnable) {
    var cleanup: () -> Unit = {}
  }

  fun check(id: String, store: String, promise: Promise) {
    if (disposed || pending.containsKey(id)) {
      promise.reject("ERR_STORE_CHECK", "Update checker is unavailable", null)
      return
    }
    if (pending.values.any { it.store == store }) {
      promise.resolve(unavailable("busy"))
      return
    }
    val timeout = Runnable { finish(id, unavailable("timeout")) }
    pending[id] = Request(promise, store, timeout)
    handler.postDelayed(timeout, 15_000)
    try {
      when (store) {
        "honor" -> checkHonor(id)
        "xiaomi" -> pending[id]?.cleanup = XiaomiStoreQuery.check(context) { result ->
          handler.post { finish(id, result) }
        }
        "vivo" -> checkVivo(id)
        else -> finish(id, unavailable("unsupported"))
      }
    } catch (_: Exception) {
      finish(id, unavailable("queryFailed"))
    }
  }

  fun cancel(id: String) {
    val request = take(id) ?: return
    request.promise.reject("ERR_STORE_CANCELLED", "Update check cancelled", null)
  }

  fun dispose() {
    disposed = true
    pending.keys.toList().forEach(::cancel)
    worker.shutdownNow()
  }

  private fun take(id: String): Request? {
    val request = pending.remove(id) ?: return null
    handler.removeCallbacks(request.timeout)
    request.cleanup()
    return request
  }

  private fun finish(id: String, result: StoreResult) {
    take(id)?.promise?.resolve(result)
  }

  private fun checkHonor(id: String) {
    // Do not call handleUpdateWithAppMarket: Cherry owns the prompt and the update action.
    UpdateCallAPI.checkUpdateFromAppMarket(context) { response ->
      val result = when (response?.resultCode) {
        0 -> mapOf(
          "status" to "available",
          "versionCode" to response.versionCode?.toLongOrNull(),
          "versionName" to response.versionName,
          "notes" to response.desc,
        )
        1 -> mapOf("status" to "upToDate")
        else -> unavailable("queryFailed", response?.resultCode)
      }
      handler.post { finish(id, result) }
    }
  }

  private fun checkVivo(id: String) {
    val uri = Uri.parse("content://com.bbk.appstore.self_update_query")
    val provider = context.packageManager.resolveContentProvider(uri.authority!!, 0)
    if (provider?.packageName != "com.bbk.appstore" || !provider.enabled) {
      finish(id, unavailable("nativeUnavailable"))
      return
    }
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "third.self.update.action.SELF_UPDATE_RESULT") return
        val result = runCatching {
          val code = intent.getIntExtra("resultCode", -1)
          // The official protocol documents 0 as available and all other codes as failures.
          // It does not define a reliable "up to date" code.
          if (code == 0) mapOf(
            "status" to "available",
            "versionCode" to intent.getStringExtra("versionCode")?.toLongOrNull(),
            "versionName" to intent.getStringExtra("versionName"),
            "notes" to null,
          ) else unavailable("queryFailed", code)
        }.getOrElse { unavailable("invalidResponse") }
        finish(id, result)
      }
    }
    ContextCompat.registerReceiver(
      context, receiver, IntentFilter("third.self.update.action.SELF_UPDATE_RESULT"),
      ContextCompat.RECEIVER_EXPORTED,
    )
    pending[id]?.cleanup = { context.unregisterReceiver(receiver) }
    worker.execute {
      try {
        context.contentResolver.acquireUnstableContentProviderClient(uri).use { client ->
          checkNotNull(client) { "vivo update provider is unavailable" }
          // Omitting gray-version selectors asks for the available full release for this app.
          client.call("queryUpdate", null, Bundle().apply {
            putString("packageName", context.packageName)
          })
        }
      } catch (_: Exception) {
        handler.post { finish(id, unavailable("queryFailed")) }
      }
    }
  }
}

/** Xiaomi has one process-global listener and no cancellation API. Drain cancelled SDK queries
 * before admitting a new one, so a late callback can never settle a newer request. */
private object XiaomiStoreQuery {
  private val handler = Handler(Looper.getMainLooper())
  private var running = false
  private var callback: ((StoreResult) -> Unit)? = null

  fun check(context: Context, complete: (StoreResult) -> Unit): () -> Unit {
    if (running) {
      complete(unavailable("busy"))
      return {}
    }
    running = true
    callback = complete
    XiaomiUpdateAgent.setUpdateAutoPopup(false)
    XiaomiUpdateAgent.setCheckUpdateOnlyWifi(false)
    XiaomiUpdateAgent.setUpdateListener { status, response ->
      handler.post {
        val result = when (status) {
          UpdateStatus.STATUS_UPDATE -> mapOf(
            "status" to "available",
            "versionCode" to response?.versionCode,
            "versionName" to response?.versionName,
            "notes" to response?.updateLog,
          )
          UpdateStatus.STATUS_NO_UPDATE -> mapOf("status" to "upToDate")
          else -> unavailable("queryFailed", status)
        }
        val listener = callback
        callback = null
        running = false
        XiaomiUpdateAgent.setUpdateListener(null)
        listener?.invoke(result)
      }
    }
    try {
      XiaomiUpdateAgent.update(context, false)
    } catch (error: Exception) {
      callback = null
      running = false
      XiaomiUpdateAgent.setUpdateListener(null)
      throw error
    }
    return { if (callback === complete) callback = null }
  }
}
