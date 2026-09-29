package expo.modules.remotediscovery

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.LinkProperties
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executor

class RemoteDiscoveryModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private var browser: DesktopBrowser? = null

  override fun definition() = ModuleDefinition {
    Name("RemoteDiscovery")
    Events("change")
    Function("start") { generation: Int ->
      handler.post {
        if (browser == null) appContext.reactContext?.let { context ->
          browser = DesktopBrowser(context, handler) { sendEvent("change", it + ("generation" to generation)) }.also { it.start() }
        }
      }
    }
    Function("setBrowsing") { enabled: Boolean -> handler.post { browser?.setBrowsing(enabled) }; Unit }
    Function("stop") { handler.post { browser?.stop(); browser = null }; Unit }
    OnDestroy { handler.post { browser?.stop(); browser = null } }
  }
}

private class DesktopBrowser(
  context: Context,
  private val handler: Handler,
  private val emit: (Map<String, Any>) -> Unit,
) {
  private val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager
  private val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  private val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
  private val executor = Executor { handler.post(it) }
  private var lock: WifiManager.MulticastLock? = null
  private var discovery: NsdManager.DiscoveryListener? = null
  private var active = false
  private var revision = 0
  private val services = linkedMapOf<String, NsdServiceInfo>()
  private val callbacks = mutableMapOf<String, NsdManager.ServiceInfoCallback>()
  private val queue = ArrayDeque<Pair<String, NsdServiceInfo>>()
  private var resolving: NsdManager.ResolveListener? = null
  private var networkKey: String? = null
  private val network = object : ConnectivityManager.NetworkCallback() {
    override fun onLinkPropertiesChanged(network: Network, properties: LinkProperties) {
      handler.post {
        if (!active) return@post
        val key = "$network:${properties.linkAddresses}:${properties.routes}"
        if (key != networkKey) {
          val previous = networkKey
          networkKey = key
          if (previous != null) networkChanged()
        }
      }
    }
    override fun onLost(network: Network) { handler.post { if (active) networkChanged() } }
  }

  fun start() {
    active = true
    try { connectivity.registerDefaultNetworkCallback(network) }
    catch (_: Exception) { emit(mapOf("type" to "unavailable")) }
  }

  private fun networkChanged() {
    val browsing = discovery != null
    setBrowsing(false)
    emit(mapOf("type" to "network"))
    if (browsing) setBrowsing(true)
  }

  fun setBrowsing(enabled: Boolean) {
    if (!active || enabled == (discovery != null)) return
    if (!enabled) {
      revision++
      val previous = discovery
      discovery = null
      try { previous?.let { nsd.stopServiceDiscovery(it) } } catch (_: Exception) { }
      if (Build.VERSION.SDK_INT >= 34) {
        callbacks.values.forEach { try { nsd.unregisterServiceInfoCallback(it) } catch (_: Exception) { } }
        resolving?.let { try { nsd.stopServiceResolution(it) } catch (_: Exception) { } }
      }
      callbacks.clear()
      queue.clear()
      resolving = null
      for (id in services.keys) emit(mapOf("type" to "remove", "id" to id))
      services.clear()
      lock?.let { if (it.isHeld) it.release() }
      lock = null
      return
    }
    val current = ++revision
    val listener = object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(type: String) = Unit
      override fun onDiscoveryStopped(type: String) = Unit
      override fun onStartDiscoveryFailed(type: String, code: Int) { handler.post {
        if (current != revision) return@post
        emit(mapOf("type" to "unavailable")); setBrowsing(false)
      } }
      override fun onStopDiscoveryFailed(type: String, code: Int) = Unit
      override fun onServiceFound(service: NsdServiceInfo) { handler.post {
        if (current != revision || services.size >= 64) return@post
        val id = serviceId(service)
        if (services.containsKey(id)) return@post
        services[id] = service
        if (Build.VERSION.SDK_INT >= 34) watch(id, service, current)
        else { queue.add(id to service); resolveNext(current) }
      } }
      override fun onServiceLost(service: NsdServiceInfo) { handler.post {
        if (current != revision) return@post
        val id = serviceId(service)
        services.remove(id)
        if (Build.VERSION.SDK_INT >= 34) callbacks.remove(id)?.let {
          try { nsd.unregisterServiceInfoCallback(it) } catch (_: Exception) { }
        }
        emit(mapOf("type" to "remove", "id" to id))
      } }
    }
    discovery = listener
    try {
      lock = wifi.createMulticastLock("cherry-remote-discovery").also { it.setReferenceCounted(false); it.acquire() }
      nsd.discoverServices("_cherry-remote._tcp.", NsdManager.PROTOCOL_DNS_SD, listener)
    } catch (_: Exception) { emit(mapOf("type" to "unavailable")); setBrowsing(false) }
  }

  private fun serviceId(service: NsdServiceInfo): String =
    if (Build.VERSION.SDK_INT >= 33) "${service.serviceName}:${service.serviceType}:${service.network}"
    else "${service.serviceName}:${service.serviceType}"

  @android.annotation.TargetApi(34)
  private fun watch(id: String, info: NsdServiceInfo, current: Int) {
    val callback = object : NsdManager.ServiceInfoCallback {
      override fun onServiceInfoCallbackRegistrationFailed(code: Int) {
        if (current == revision) { callbacks.remove(id); emit(mapOf("type" to "remove", "id" to id)) }
      }
      override fun onServiceUpdated(info: NsdServiceInfo) { if (current == revision) publish(id, info) }
      override fun onServiceLost() { if (current == revision) emit(mapOf("type" to "remove", "id" to id)) }
      override fun onServiceInfoCallbackUnregistered() = Unit
    }
    callbacks[id] = callback
    try { nsd.registerServiceInfoCallback(info, executor, callback) }
    catch (_: Exception) { callbacks.remove(id); emit(mapOf("type" to "unavailable")) }
  }

  @Suppress("DEPRECATION")
  private fun resolveNext(current: Int) {
    if (resolving != null || current != revision || queue.isEmpty()) return
    val (id, info) = queue.removeFirst()
    val listener = object : NsdManager.ResolveListener {
      override fun onResolveFailed(service: NsdServiceInfo, code: Int) { handler.post { finish(null) } }
      override fun onServiceResolved(service: NsdServiceInfo) { handler.post { finish(service) } }
      fun finish(service: NsdServiceInfo?) {
        if (current != revision || resolving !== this) return
        resolving = null
        if (services.containsKey(id) && service != null) publish(id, service)
        resolveNext(current)
      }
    }
    resolving = listener
    try { nsd.resolveService(info, listener) }
    catch (_: Exception) { resolving = null; resolveNext(current) }
  }

  @Suppress("DEPRECATION")
  private fun publish(id: String, info: NsdServiceInfo) {
    if (!services.containsKey(id)) return
    if (info.attributes.entries.sumOf { it.key.length + (it.value?.size ?: 0) } > 512) return
    val hosts = if (Build.VERSION.SDK_INT >= 34) info.hostAddresses.mapNotNull { it.hostAddress }
      else listOfNotNull(info.host?.hostAddress)
    val txt = info.attributes.mapValues { it.value?.toString(Charsets.UTF_8) ?: "" }
    emit(mapOf("type" to "service", "id" to id, "hosts" to hosts.take(16), "txt" to txt, "port" to info.port))
  }

  fun stop() {
    setBrowsing(false)
    active = false
    try { connectivity.unregisterNetworkCallback(network) } catch (_: Exception) { }
  }
}
