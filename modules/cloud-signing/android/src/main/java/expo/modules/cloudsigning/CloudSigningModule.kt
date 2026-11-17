package expo.modules.cloudsigning

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class CloudSigningModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CherryCloudSigning")

    AsyncFunction("sign") { value: String ->
      val context = appContext.reactContext ?: error("React context is unavailable")
      val id = context.resources.getIdentifier("cherry_cloud_client_secret", "string", context.packageName)
      val secret = if (id == 0) "" else context.getString(id)
      if (secret.isEmpty()) {
        null
      } else {
        val hmac = Mac.getInstance("HmacSHA256")
        hmac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        hmac.doFinal(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
      }
    }
  }
}
