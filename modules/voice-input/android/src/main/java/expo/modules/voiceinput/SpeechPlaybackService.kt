package expo.modules.voiceinput

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import expo.modules.kotlin.Promise

/** One user-initiated reading spans all TTS utterances and network synthesis chunks. Main thread only. */
class SpeechPlaybackService : Service() {
  private class Reading(
    val id: String,
    val title: String,
    val subtitle: String,
    val channelName: String,
    val playLabel: String,
    val pauseLabel: String,
    val stopLabel: String,
    val deepLinkUrl: String?,
    var state: String,
    var ready: Promise?,
    val endPromises: MutableList<Promise> = mutableListOf(),
    val onCommand: (String) -> Unit,
  )

  private var owner: Reading? = null
  private var media: MediaSession? = null
  private var focus: AudioFocusRequest? = null
  private var hasAudioFocus: Boolean = false
  private var lastStartId: Int = -1
  private var wakeLock: PowerManager.WakeLock? = null

  companion object {
    /**
     * DESIGN.md notification brand red. Android draws the small-icon mask black on light
     * accents (luminance > 0.179), so `brand` #FF5757 is darkened to keep the mark white.
     */
    private const val BRAND_COLOR = 0xFFC74444.toInt()
    private const val CHANNEL = "voice-reading"
    private const val NOTIFICATION = 9072
    private const val PAUSE = "pause"
    private const val RESUME = "resume"
    private const val STOP = "stop"
    private const val INTERRUPT = "interrupt"
    private const val RESUME_INTERRUPTION = "resume-interruption"
    private const val ACTION_CUSTOM_STOP = "expo.modules.voiceinput.ACTION_STOP"
    private var requested: Reading? = null
    private var active: SpeechPlaybackService? = null

    fun begin(
      context: Context,
      id: String,
      title: String,
      subtitle: String,
      channelName: String,
      playLabel: String,
      pauseLabel: String,
      stopLabel: String,
      deepLinkUrl: String?,
      ready: Promise,
      onCommand: (String) -> Unit,
    ) {
      check(requested == null) { "Another reading is active" }
      requested = Reading(
        id = id,
        title = title,
        subtitle = subtitle,
        channelName = channelName,
        playLabel = playLabel,
        pauseLabel = pauseLabel,
        stopLabel = stopLabel,
        deepLinkUrl = deepLinkUrl,
        state = "preparing",
        ready = ready,
        onCommand = onCommand,
      )
      try {
        context.startForegroundService(
          Intent(context, SpeechPlaybackService::class.java).putExtra("id", id),
        )
      } catch (error: Exception) {
        requested = null
        throw error
      }
    }

    fun requestFocus(id: String): Boolean {
      val reading = requested?.takeIf { it.id == id } ?: return false
      return active?.takeIf { it.owner === reading }?.ensureAudioFocus() ?: false
    }

    fun updateState(id: String, state: String) {
      val reading = requested?.takeIf { it.id == id } ?: return
      reading.state = state
      active?.takeIf { it.owner === reading }?.applyState(reading)
    }

    fun end(id: String, done: Promise? = null) {
      val reading = requested?.takeIf { it.id == id }
      if (reading == null) {
        done?.resolve(null)
        return
      }
      done?.let { reading.endPromises.add(it) }
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
    lastStartId = startId
    val id = intent?.getStringExtra("id")
    when (intent?.action) {
      STOP -> {
        if (id != null && owner?.id == id) interrupt()
        if (owner == null && requested == null) stopSelf(startId)
        return START_NOT_STICKY
      }
      PAUSE -> {
        owner?.takeIf { it.id == id }?.onCommand?.invoke(PAUSE)
        if (owner == null && requested == null) stopSelf(startId)
        return START_NOT_STICKY
      }
      RESUME -> {
        owner?.takeIf { it.id == id }?.onCommand?.invoke(RESUME)
        if (owner == null && requested == null) stopSelf(startId)
        return START_NOT_STICKY
      }
    }

    val reading = requested?.takeIf { it.id == id }
    if (reading == null || intent == null) {
      if (owner == null && requested == null) stopSelf(startId)
      return START_NOT_STICKY
    }
    owner = reading
    active = this
    try {
      val session = MediaSession(this, CHANNEL)
      media = session
      session.setCallback(object : MediaSession.Callback() {
        override fun onPlay() {
          if (owner === reading) reading.onCommand(RESUME)
        }

        override fun onPause() {
          if (owner === reading) reading.onCommand(PAUSE)
        }

        override fun onStop() {
          if (owner === reading) interrupt()
        }

        override fun onCustomAction(action: String, extras: Bundle?) {
          if (action == ACTION_CUSTOM_STOP && owner === reading) interrupt()
        }
      })
      session.setMetadata(
        MediaMetadata.Builder()
          .putString(MediaMetadata.METADATA_KEY_TITLE, reading.title)
          .putString(MediaMetadata.METADATA_KEY_ARTIST, reading.subtitle)
          .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, reading.title)
          .putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, reading.subtitle)
          .build(),
      )
      updateSessionPlaybackState(session, reading)
      session.isActive = true

      val manager = getSystemService(NotificationManager::class.java)
      val channel = NotificationChannel(
        CHANNEL,
        reading.channelName,
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        setSound(null, null)
        enableVibration(false)
      }
      manager.createNotificationChannel(channel)
      startForeground(NOTIFICATION, buildNotification(reading, session))
      if (reading.ready == null) {
        finish()
        return START_NOT_STICKY
      }
      val audio = getSystemService(AudioManager::class.java)
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build(),
        )
        .setWillPauseWhenDucked(true)
        .setOnAudioFocusChangeListener({ change ->
          if (owner !== reading) return@setOnAudioFocusChangeListener
          when (change) {
            AudioManager.AUDIOFOCUS_LOSS -> {
              hasAudioFocus = false
              interrupt()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
              hasAudioFocus = false
              reading.onCommand(INTERRUPT)
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
              hasAudioFocus = true
              reading.onCommand(RESUME_INTERRUPTION)
            }
          }
        }, Handler(Looper.getMainLooper()))
        .build()
      check(audio.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
        "Audio focus unavailable"
      }
      focus = request
      hasAudioFocus = true
      syncWakeLock(reading.state)
      reading.ready?.resolve(null)
      reading.ready = null
    } catch (error: Exception) {
      reading.ready?.reject("ERR_PLAYBACK_START", "Cannot start background reading", error)
      reading.ready = null
      finish()
    }
    return START_NOT_STICKY
  }

  private fun ensureAudioFocus(): Boolean {
    if (hasAudioFocus) return true
    val request = focus ?: return false
    val audio = getSystemService(AudioManager::class.java)
    val granted = audio.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    hasAudioFocus = granted
    return granted
  }

  private fun applyState(reading: Reading) {
    if (reading.state == "playing" && !ensureAudioFocus()) {
      reading.state = "paused"
      reading.onCommand(INTERRUPT)
    }
    val session = media ?: return
    updateSessionPlaybackState(session, reading)
    syncWakeLock(reading.state)
    getSystemService(NotificationManager::class.java)
      .notify(NOTIFICATION, buildNotification(reading, session))
  }

  private fun updateSessionPlaybackState(session: MediaSession, reading: Reading) {
    val playbackState = when (reading.state) {
      "playing" -> PlaybackState.STATE_PLAYING
      "paused" -> PlaybackState.STATE_PAUSED
      else -> PlaybackState.STATE_BUFFERING
    }
    val actions = when (reading.state) {
      "playing" -> PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_STOP
      "paused" -> PlaybackState.ACTION_PLAY or PlaybackState.ACTION_STOP
      else -> PlaybackState.ACTION_STOP
    }
    val rate = if (reading.state == "playing") 1f else 0f
    // Android 13+ derives system media card actions from PlaybackState custom actions.
    val stopAction = PlaybackState.CustomAction.Builder(
      ACTION_CUSTOM_STOP,
      reading.stopLabel,
      R.drawable.ic_voice_stop,
    ).build()
    session.setPlaybackState(
      PlaybackState.Builder()
        .setActions(actions)
        .addCustomAction(stopAction)
        .setState(playbackState, PlaybackState.PLAYBACK_POSITION_UNKNOWN, rate)
        .build(),
    )
  }

  private fun syncWakeLock(state: String) {
    if (state == "paused") {
      wakeLock?.let { if (it.isHeld) it.release() }
      wakeLock = null
    } else if (wakeLock == null) {
      wakeLock = getSystemService(PowerManager::class.java)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CherryStudio:reading")
        .also { it.acquire() }
    }
  }

  private fun buildNotification(reading: Reading, session: MediaSession): Notification {
    val smallIcon = resources.getIdentifier("notification_icon", "drawable", packageName)
      .takeIf { it != 0 } ?: applicationInfo.icon
    val isPaused = reading.state == "paused"
    val toggleAction = if (isPaused) RESUME else PAUSE
    val toggleIcon = if (isPaused) R.drawable.ic_voice_play else R.drawable.ic_voice_pause
    val toggleLabel = if (isPaused) reading.playLabel else reading.pauseLabel
    val toggleRequestCode = if (isPaused) 0 else 1

    val builder = Notification.Builder(this, CHANNEL)
      .setSmallIcon(smallIcon)
      .setColor(BRAND_COLOR)
      .setContentTitle(reading.title)
      .setContentText(reading.subtitle)
      .setOnlyAlertOnce(true)
      .setOngoing(!isPaused)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setDeleteIntent(actionPendingIntent(STOP, reading.id, 2))
      .addAction(
        Notification.Action.Builder(
          Icon.createWithResource(this, toggleIcon),
          toggleLabel,
          actionPendingIntent(toggleAction, reading.id, toggleRequestCode),
        ).build(),
      )
      .addAction(
        Notification.Action.Builder(
          Icon.createWithResource(this, R.drawable.ic_voice_stop),
          reading.stopLabel,
          actionPendingIntent(STOP, reading.id, 2),
        ).build(),
      )
      .setStyle(
        Notification.MediaStyle()
          .setMediaSession(session.sessionToken)
          .setShowActionsInCompactView(0, 1),
      )

    if (reading.channelName.isNotEmpty() && reading.channelName != reading.title) {
      builder.setSubText(reading.channelName)
    }

    val launchIntent = if (!reading.deepLinkUrl.isNullOrEmpty()) {
      Intent(Intent.ACTION_VIEW, Uri.parse(reading.deepLinkUrl)).setPackage(packageName)
    } else {
      packageManager.getLaunchIntentForPackage(packageName)
    }
    launchIntent?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      builder.setContentIntent(
        PendingIntent.getActivity(
          this,
          NOTIFICATION,
          it,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )
    }

    return builder.build()
  }

  private fun actionPendingIntent(action: String, readingId: String, requestCode: Int): PendingIntent {
    val command = Intent(this, SpeechPlaybackService::class.java)
      .setAction(action)
      .setData(Uri.fromParts("reading", "$readingId:$action", null))
      .putExtra("id", readingId)
    return PendingIntent.getService(
      this,
      requestCode,
      command,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    interrupt()
  }

  override fun onDestroy() {
    owner?.let { it.onCommand(STOP) }
    clear()
    super.onDestroy()
  }

  private fun interrupt() {
    owner?.onCommand(STOP)
    finish()
  }

  private fun finish() {
    clear()
    stopForeground(STOP_FOREGROUND_REMOVE)
    if (lastStartId >= 0) stopSelf(lastStartId) else stopSelf()
  }

  private fun clear() {
    val finished = owner
    if (requested === finished) requested = null
    owner = null
    if (active === this) active = null
    hasAudioFocus = false
    focus?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
    focus = null
    media?.release()
    media = null
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    if (finished != null) {
      val waiters = finished.endPromises.toList()
      finished.endPromises.clear()
      waiters.forEach { it.resolve(null) }
    }
  }
}
