package expo.modules.relaysocket

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import java.net.URI
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

class RelaySocketModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private val sockets = mutableMapOf<String, RelayConnection>()
  private val client = OkHttpClient.Builder()
    .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
    .connectTimeout(15, TimeUnit.SECONDS).writeTimeout(15, TimeUnit.SECONDS).build()

  override fun definition() = ModuleDefinition {
    Name("RelaySocket")
    Events("socket")
    Function("connect") { id: String, address: String ->
      handler.post {
        try {
          val url = URI(address)
          require(url.scheme == "wss" && url.host != null && url.userInfo == null && url.rawQuery == null && url.rawFragment == null && url.path == "/v1/relay")
          require(!sockets.containsKey(id) && sockets.size < 32)
          val connection = RelayConnection(handler) { event ->
            sendEvent("socket", event + ("id" to id))
            if (event["type"] == "close") sockets.remove(id)
          }
          sockets[id] = connection
          connection.socket = client.newWebSocket(Request.Builder().url(address).build(), connection)
        } catch (_: Exception) { sendEvent("socket", mapOf("id" to id, "type" to "error")) }
      }; Unit
    }
    AsyncFunction("send") { id: String, data: String, binary: Boolean, promise: Promise ->
      handler.post {
        val connection = sockets[id]
        if (connection == null) promise.reject("ERR_RELAY_CLOSED", "Relay socket is closed", null)
        else connection.send(data, binary, promise)
      }; Unit
    }
    Function("received") { id: String -> handler.post { sockets[id]?.received() }; Unit }
    Function("close") { id: String -> handler.post { sockets[id]?.finish() }; Unit }
    OnDestroy {
      handler.post {
        sockets.values.toList().forEach { it.finish() }
        sockets.clear()
        client.dispatcher.executorService.shutdown()
        client.connectionPool.evictAll()
      }
    }
  }
}

private class RelayConnection(
  private val handler: Handler,
  private val emit: (Map<String, Any>) -> Unit,
) : WebSocketListener() {
  lateinit var socket: WebSocket
  @Volatile private var closed = false
  private var open = false
  private var pendingSend: Promise? = null
  private var drain: Runnable? = null
  private val receipt = Semaphore(0)
  private val maxBytes = 65_560

  override fun onOpen(webSocket: WebSocket, response: Response) {
    handler.post { if (!closed) { open = true; emit(mapOf("type" to "open")) } }
  }
  override fun onFailure(webSocket: WebSocket, error: Throwable, response: Response?) {
    handler.post { finish(true) }
  }
  override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { handler.post { finish() } }
  override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { handler.post { finish() } }
  override fun onMessage(webSocket: WebSocket, text: String) { deliver(text, false, text.toByteArray(Charsets.UTF_8).size) }
  override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
    if (bytes.size > maxBytes) { handler.post { finish(true) }; return }
    deliver(bytes.base64(), true, bytes.size)
  }
  private fun deliver(data: String, binary: Boolean, size: Int) {
    if (closed) return
    if (size > maxBytes) { handler.post { finish(true) }; return }
    // Runs on OkHttp's read thread: do not read another message until JS consumes this event.
    handler.post { if (!closed) emit(mapOf("type" to "message", "data" to data, "binary" to binary)) }
    try {
      if (!receipt.tryAcquire(15, TimeUnit.SECONDS)) handler.post { finish(true) }
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
      handler.post { finish(true) }
    }
  }
  fun received() { if (!closed) receipt.release() }
  fun send(data: String, binary: Boolean, promise: Promise) {
    if (!open || closed || pendingSend != null) {
      promise.reject("ERR_RELAY_SEND", "Relay socket is closed or busy", null)
      return
    }
    try {
      val bytes = if (binary) Base64.decode(data, Base64.NO_WRAP) else data.toByteArray(Charsets.UTF_8)
      require(bytes.size <= maxBytes)
      pendingSend = promise
      val accepted = if (binary) socket.send(bytes.toByteString()) else socket.send(data)
      if (!accepted) { finish(true); return }
      val deadline = SystemClock.elapsedRealtime() + 15_000
      val poll = object : Runnable {
        override fun run() {
          if (closed) return
          if (socket.queueSize() == 0L) {
            val pending = pendingSend
            pendingSend = null
            drain = null
            pending?.resolve(null)
          } else if (SystemClock.elapsedRealtime() >= deadline) finish(true)
          else handler.postDelayed(this, 10)
        }
      }
      drain = poll
      poll.run()
    } catch (_: Exception) {
      if (pendingSend == null) promise.reject("ERR_RELAY_SIZE", "Invalid Relay frame", null)
      finish(true)
    }
  }
  fun finish(failed: Boolean = false) {
    if (closed) return
    closed = true
    drain?.let { handler.removeCallbacks(it) }
    drain = null
    pendingSend?.reject("ERR_RELAY_CLOSED", "Relay socket closed before send completed", null)
    pendingSend = null
    receipt.release()
    if (::socket.isInitialized) socket.cancel()
    if (failed) emit(mapOf("type" to "error"))
    emit(mapOf("type" to "close"))
  }
}
