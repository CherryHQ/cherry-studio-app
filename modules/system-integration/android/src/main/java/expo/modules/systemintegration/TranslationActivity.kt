package expo.modules.systemintegration

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** A temporary system window. No React host, history, saved view state, or text replacement. */
class TranslationActivity : Activity() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
  private var request: Job? = null
  private var generation = 0
  private var source = ""
  private var result = ""
  private var target = "en-US"
  private var inputFailure: String? = null
  private lateinit var output: TextView
  private lateinit var modelLabel: TextView
  private lateinit var copy: Button
  private lateinit var retry: Button

  override fun attachBaseContext(base: Context) {
    val language = TranslationConfigurationStore.display(base)?.optString("interfaceLanguage")
    if (!language.isNullOrBlank()) {
      val configuration = Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(language)) }
      super.attachBaseContext(base.createConfigurationContext(configuration))
    } else super.attachBaseContext(base)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    setResult(RESULT_CANCELED)
    if (savedInstanceState != null) { finish(); return }
    accept(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    accept(intent)
  }

  private fun accept(incoming: Intent) {
    request?.cancel()
    generation += 1
    source = if (incoming.action == Intent.ACTION_PROCESS_TEXT) {
      incoming.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString().orEmpty()
    } else if (incoming.action == ACTION_TRANSLATE) {
      incoming.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
    } else ""
    inputFailure = when {
      source.length > 16_000 -> "inputTooLarge"
      source.isBlank() -> "invalidInput"
      else -> null
    }
    if (inputFailure != null) source = ""
    setIntent(Intent())
    val configuration = TranslationConfigurationStore.display(this)
    target = configuration?.optString("targetLanguage")?.takeIf { it.isNotBlank() } ?: Locale.getDefault().toLanguageTag()
    if (!TemporaryTranslation.languagePattern.matches(target)) target = "en-US"
    buildView()
    translate()
  }

  private fun buildView() {
    val padding = (20 * resources.displayMetrics.density).toInt()
    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(padding, padding, padding, padding)
      isSaveEnabled = false
    }
    fun text(value: CharSequence, selectable: Boolean = false) = TextView(this).apply {
      text = value
      setTextIsSelectable(selectable)
      isSaveEnabled = false
      setPadding(0, padding / 3, 0, padding / 3)
      content.addView(this)
    }
    text(getString(R.string.cherry_translation_title)).textSize = 20f
    modelLabel = text("")
    TranslationConfigurationStore.display(this)?.let { configuration ->
      modelLabel.text = listOf(configuration.optString("modelName"), configuration.optString("providerName"))
        .filter { it.isNotBlank() }.joinToString(" · ")
    }
    text(getString(R.string.cherry_translation_target))
    val languages = listOf(target, "zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR", "fr-FR", "de-DE", "es-ES", "pt-PT", "ru-RU", "vi-VN").distinct()
    content.addView(Spinner(this).apply {
      isSaveEnabled = false
      adapter = ArrayAdapter(this@TranslationActivity, android.R.layout.simple_spinner_dropdown_item,
        languages.map { Locale.forLanguageTag(it).getDisplayName(Locale.getDefault()) })
      onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
        override fun onNothingSelected(parent: AdapterView<*>?) {}
        override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
          if (target != languages[position]) { target = languages[position]; translate() }
        }
      }
    })
    text(getString(R.string.cherry_translation_original))
    text(source, true)
    text(getString(R.string.cherry_translation_result))
    output = text("", true)
    copy = Button(this).apply {
      setText(R.string.cherry_translation_copy)
      isEnabled = false
      setOnClickListener {
        if (result.isNotEmpty()) {
          (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager)
            .setPrimaryClip(ClipData.newPlainText(getString(R.string.cherry_translation_result), result))
          Toast.makeText(this@TranslationActivity, R.string.cherry_translation_copied, Toast.LENGTH_SHORT).show()
        }
      }
    }
    content.addView(copy)
    retry = Button(this).apply { setText(R.string.cherry_translation_retry); setOnClickListener { translate() } }
    content.addView(retry)
    content.addView(Button(this).apply { setText(R.string.cherry_translation_close); setOnClickListener { finish() } })
    text(getString(R.string.cherry_translation_privacy))
    setContentView(ScrollView(this).apply { isSaveEnabled = false; addView(content) })
    window.setLayout(
      (resources.displayMetrics.widthPixels - padding).coerceAtMost((600 * resources.displayMetrics.density).toInt()),
      (resources.displayMetrics.heightPixels * 0.8).toInt()
    )
  }

  private fun translate() {
    request?.cancel()
    val current = ++generation
    result = ""
    copy.isEnabled = false
    retry.isEnabled = false
    output.setText(R.string.cherry_translation_running)
    inputFailure?.let { output.setText(errorText(it)); retry.isEnabled = false; return }
    request = scope.launch {
      try {
        val configuration = TranslationConfigurationStore.read(this@TranslationActivity)
        modelLabel.text = "${configuration.modelName} · ${configuration.providerName}"
        val translated = TemporaryTranslation.translate(applicationContext, source, target)
        if (current == generation && !isFinishing) {
          result = translated
          output.text = translated
          copy.isEnabled = true
        }
      } catch (_: CancellationException) {
        // Closing, retrying, and changing language are terminal for this attempt.
      } catch (error: TranslationFailure) {
        if (current == generation && !isFinishing) output.setText(errorText(error.code))
      } catch (_: Exception) {
        if (current == generation && !isFinishing) output.setText(R.string.cherry_translation_failed)
      } finally {
        if (current == generation && !isFinishing) retry.isEnabled = true
      }
    }
  }

  private fun errorText(code: String): Int = when (code) {
    "modelNotConfigured" -> R.string.cherry_translation_setup
    "modelUnavailable" -> R.string.cherry_translation_model_unavailable
    "providerUnavailable" -> R.string.cherry_translation_provider_unavailable
    "unsupportedProvider" -> R.string.cherry_translation_unsupported_provider
    "configurationStale" -> R.string.cherry_translation_configuration_stale
    "credentialsUnavailable" -> R.string.cherry_translation_credentials_unavailable
    "invalidInput" -> R.string.cherry_translation_invalid_input
    "inputTooLarge" -> R.string.cherry_translation_input_too_large
    "authenticationFailed" -> R.string.cherry_translation_authentication_failed
    "rateLimited" -> R.string.cherry_translation_rate_limited
    "timedOut" -> R.string.cherry_translation_timed_out
    "networkUnavailable" -> R.string.cherry_translation_network_unavailable
    "invalidResult" -> R.string.cherry_translation_invalid_result
    else -> R.string.cherry_translation_failed
  }

  override fun onSaveInstanceState(outState: Bundle) {
    // A marker closes a recreated activity; source/result never enter saved instance state.
    outState.putBoolean("closed", true)
  }

  override fun onStop() {
    super.onStop()
    finish()
  }

  override fun onDestroy() {
    generation += 1
    scope.cancel()
    source = ""
    result = ""
    if (::output.isInitialized) output.text = ""
    super.onDestroy()
  }

  companion object {
    const val ACTION_TRANSLATE = "expo.modules.systemintegration.TRANSLATE"
  }
}
