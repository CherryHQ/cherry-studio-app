package expo.modules.systemintegration

import android.app.KeyguardManager
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.net.URI
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

internal class TranslationFailure(val code: String) : Exception(code)

internal data class TranslationConfiguration(
  val revision: String,
  val modelName: String,
  val providerName: String,
  val wireModelId: String,
  val endpoint: String,
  val apiKey: String,
  val targetLanguage: String,
  val instructionTemplate: String
)

/** Only configuration is persisted. This store never accepts source text or results. */
internal object TranslationConfigurationStore {
  private val lock = Any()
  private const val FILE_NAME = "translation.enc"

  fun root(context: Context): File = File(context.noBackupFilesDir, "cherry-system-integration").apply { mkdirs() }

  fun invalidate(context: Context) = synchronized(lock) {
    AtomicFile(File(root(context), FILE_NAME)).delete()
  }

  fun publish(context: Context, configuration: Map<String, Any?>, apiKey: String) = synchronized(lock) {
    val value = JSONObject(configuration).put("apiKey", apiKey)
    parse(value)
    write(context, value)
  }

  fun publishUnavailable(context: Context, configuration: Map<String, Any?>) = synchronized(lock) {
    write(context, JSONObject(configuration).put("unavailable", true))
  }

  private fun write(context: Context, value: JSONObject) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key(context))
    val encrypted = cipher.doFinal(value.toString().toByteArray(Charsets.UTF_8))
    val file = AtomicFile(File(root(context), FILE_NAME))
    val output = file.startWrite()
    try {
      output.write(cipher.iv.size)
      output.write(cipher.iv)
      output.write(encrypted)
      file.finishWrite(output)
    } catch (_: Exception) {
      file.failWrite(output)
      throw TranslationFailure("configurationStale")
    }
  }

  fun read(context: Context): TranslationConfiguration = parse(readValues(context))

  fun display(context: Context): JSONObject? = try { readValues(context) } catch (_: Exception) { null }

  private fun readValues(context: Context): JSONObject = synchronized(lock) {
    if ((context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager)?.isDeviceLocked == true) {
      throw TranslationFailure("credentialsUnavailable")
    }
    val file = AtomicFile(File(root(context), FILE_NAME))
    if (!file.baseFile.exists()) throw TranslationFailure("configurationStale")
    try {
      val bytes = file.readFully()
      if (bytes.size !in 30..65_536) throw TranslationFailure("configurationStale")
      val ivLength = bytes[0].toInt()
      if (ivLength != 12 || bytes.size <= ivLength + 1) throw TranslationFailure("configurationStale")
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(context), GCMParameterSpec(128, bytes.copyOfRange(1, 1 + ivLength)))
      JSONObject(String(cipher.doFinal(bytes.copyOfRange(1 + ivLength, bytes.size)), Charsets.UTF_8))
    } catch (failure: TranslationFailure) {
      throw failure
    } catch (_: Exception) {
      throw TranslationFailure("credentialsUnavailable")
    }
  }

  fun revision(context: Context): String? = try { read(context).revision } catch (_: Exception) { null }

  private fun key(context: Context): SecretKey {
    val alias = "${context.packageName}.cherry-translation"
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setRandomizedEncryptionRequired(true)
      .build())
    return generator.generateKey()
  }

  private fun parse(value: JSONObject): TranslationConfiguration {
    if (value.optBoolean("unavailable")) throw TranslationFailure(value.optString("reason", "configurationStale"))
    val endpoint = value.getString("endpoint")
    val uri = URI(endpoint)
    val apiKey = value.getString("apiKey")
    if (value.optInt("version") != 1 || uri.scheme != "https" || uri.host.isNullOrBlank() ||
      uri.userInfo != null || uri.fragment != null || uri.query != null ||
      apiKey.isBlank() || apiKey.contains('\r') || apiKey.contains('\n')) {
      throw TranslationFailure("configurationStale")
    }
    return TranslationConfiguration(
      revision = value.getString("revision"),
      modelName = value.getString("modelName"),
      providerName = value.getString("providerName"),
      wireModelId = value.getString("wireModelId"),
      endpoint = endpoint,
      apiKey = apiKey,
      targetLanguage = value.getString("targetLanguage"),
      instructionTemplate = value.getString("instructionTemplate")
    )
  }
}
