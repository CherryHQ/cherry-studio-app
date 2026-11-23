package expo.modules.voiceinput

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import expo.modules.kotlin.Promise

/** One user-initiated reading spans all TTS utterances and network synthesis chunks. Main thread only. */
class SpeechPlaybackService : Service() {
  private class Reading(val id: String, var ready: Promise?, val onStop: () -> Unit)
  private var owner: Reading? = null
  private var media: MediaSession? = null
  private var focus: AudioFocusRequest? = null
  private var wakeLock: PowerManager.WakeLock? = null

  companion object {
    private const val CHANNEL = "voice-reading"
    private const val NOTIFICATION = 9072
    private const val STOP = "stop"
    private var requested: Reading? = null
    private var active: SpeechPlaybackService? = null

    fun begin(context: Context, id: String, title: String, stop: String, ready: Promise, onStop: () -> Unit) {
      check(requested == null) { "Another reading is active" }
      requested = Reading(id, ready, onStop)
      try {
        context.startForegroundService(Intent(context, SpeechPlaybackService::class.java)
          .putExtra("id", id).putExtra("title", title).putExtra("stop", stop))
      } catch (error: Exception) {
        requested = null
        throw error
      }
    }

    fun end(id: String) {
      val reading = requested?.takeIf { it.id == id } ?: return
      if (reading.ready != null) {
        // The start intent is already queued. Promote and immediately release it on arrival.
        reading.ready?.reject("ERR_PLAYBACK_CANCELLED", "Reading ended", null)
        reading.ready = null
      } else {
        active?.takeIf { it.owner === reading }?.finish()
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val id = intent?.getStringExtra("id")
    if (intent?.action == STOP) {
      if (id != null && owner?.id == id) interrupt()
      if (owner == null && requested == null) stopSelf(startId)
      return START_NOT_STICKY
    }
    val reading = requested?.takeIf { it.id == id }
    if (reading == null || intent == null) {
      if (owner == null && requested == null) stopSelf(startId)
      return START_NOT_STICKY
    }
    owner = reading
    active = this
    try {
      val title = requireNotNull(intent.getStringExtra("title"))
      val stop = requireNotNull(intent.getStringExtra("stop"))
      val session = MediaSession(this, CHANNEL)
      media = session
      session.setCallback(object : MediaSession.Callback() {
        override fun onStop() { if (owner === reading) interrupt() }
        override fun onPause() = onStop()
      })
      session.setMetadata(MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, title).build())
      session.setPlaybackState(PlaybackState.Builder()
        .setActions(PlaybackState.ACTION_STOP or PlaybackState.ACTION_PAUSE)
        .setState(PlaybackState.STATE_PLAYING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f).build())
      session.isActive = true
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(NotificationChannel(CHANNEL, title, NotificationManager.IMPORTANCE_LOW))
      val command = Intent(this, SpeechPlaybackService::class.java).setAction(STOP)
        .setData(Uri.fromParts("reading", reading.id, null)).putExtra("id", reading.id)
      val cancel = PendingIntent.getService(this, 0, command, PendingIntent.FLAG_IMMUTABLE)
      val notification = Notification.Builder(this, CHANNEL)
        .setSmallIcon(android.R.drawable.ic_media_play)
        .setContentTitle(title).setOnlyAlertOnce(true).setOngoing(true)
        .setStyle(Notification.MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0))
        .addAction(Notification.Action.Builder(android.R.drawable.ic_media_pause, stop, cancel).build())
      packageManager.getLaunchIntentForPackage(packageName)?.let {
        notification.setContentIntent(PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE))
      }
      startForeground(NOTIFICATION, notification.build())
      if (reading.ready == null) {
        finish()
        return START_NOT_STICKY
      }
      val audio = getSystemService(AudioManager::class.java)
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        .setWillPauseWhenDucked(true)
        .setOnAudioFocusChangeListener({ change ->
          if (change < 0 && owner === reading) interrupt()
        }, Handler(Looper.getMainLooper())).build()
      check(audio.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { "Audio focus unavailable" }
      focus = request
      wakeLock = getSystemService(PowerManager::class.java)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CherryStudio:reading").also { it.acquire() }
      reading.ready?.resolve(null)
      reading.ready = null
    } catch (error: Exception) {
      reading.ready?.reject("ERR_PLAYBACK_START", "Cannot start background reading", error)
      reading.ready = null
      finish()
    }
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) { interrupt() }
  override fun onDestroy() {
    owner?.let { it.onStop() }
    clear()
    super.onDestroy()
  }
  private fun interrupt() {
    owner?.onStop()
    finish()
  }
  private fun finish() {
    clear()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }
  private fun clear() {
    if (requested === owner) requested = null
    owner = null
    if (active === this) active = null
    focus?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
    focus = null
    media?.release()
    media = null
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }
}
