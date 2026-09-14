package expo.modules.gmailauthorization

import android.accounts.Account
import android.app.Activity
import android.os.Handler
import android.os.Looper
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.auth.api.identity.RevokeAccessRequest
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicInteger

private const val GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
// Distinct codes also keep a late result from an old module instance out of a new attempt.
private val nextRequestCode = AtomicInteger(42000)

class GmailAuthorizationModule : Module() {
  private class Operation(val promise: Promise, var requestCode: Int? = null)
  private var active: Operation? = null

  override fun definition() = ModuleDefinition {
    Name("GmailAuthorization")

    AsyncFunction("authorize") { email: String?, interactive: Boolean, promise: Promise ->
      val operation = start(promise)
      if (operation != null) {
        val context = appContext.reactContext
        if (context == null || GoogleApiAvailability.getInstance()
            .isGooglePlayServicesAvailable(context) != ConnectionResult.SUCCESS) {
          fail(operation, "E_GMAIL_UNAVAILABLE")
        } else if (!interactive && email == null) {
          fail(operation, "E_GMAIL_AUTHORIZATION")
        } else {
          val builder = AuthorizationRequest.builder()
            .setRequestedScopes(listOf(Scope(GMAIL_READ_SCOPE)))
            .setOptOutIncludingGrantedScopes(true)
          if (email != null) builder.setAccount(Account(email, "com.google"))
          else if (interactive) builder.setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT)
          Identity.getAuthorizationClient(context).authorize(builder.build())
            .addOnSuccessListener { result ->
              if (active === operation) {
                if (!result.hasResolution()) finishAuthorization(operation, result)
                else if (!interactive) fail(operation, "E_GMAIL_AUTHORIZATION")
                else {
                  val activity = appContext.currentActivity
                  val pendingIntent = result.pendingIntent
                  if (activity == null || pendingIntent == null) fail(operation, "E_GMAIL_UNAVAILABLE")
                  else {
                    try {
                      val code = nextRequestCode.getAndIncrement()
                      operation.requestCode = code
                      activity.startIntentSenderForResult(pendingIntent.intentSender, code, null, 0, 0, 0)
                    } catch (_: Exception) {
                      fail(operation, "E_GMAIL_UNAVAILABLE")
                    }
                  }
                }
              }
            }
            .addOnFailureListener { fail(operation, errorCode(it)) }
        }
      }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { activity, result ->
      val operation = active
      if (operation != null && operation.requestCode == result.requestCode) {
        if (result.resultCode == Activity.RESULT_CANCELED) fail(operation, "E_GMAIL_CANCELLED")
        else {
          try {
            finishAuthorization(operation, Identity.getAuthorizationClient(activity)
              .getAuthorizationResultFromIntent(result.data))
          } catch (error: Exception) {
            fail(operation, errorCode(error))
          }
        }
      }
    }

    AsyncFunction("revoke") { email: String, promise: Promise ->
      val operation = start(promise)
      if (operation != null) {
        val context = appContext.reactContext
        if (context == null) fail(operation, "E_GMAIL_UNAVAILABLE")
        else Identity.getAuthorizationClient(context).revokeAccess(
          RevokeAccessRequest.builder()
            .setAccount(Account(email, "com.google"))
            .setScopes(listOf(Scope(GMAIL_READ_SCOPE)))
            .build()
        ).addOnSuccessListener { succeed(operation, null) }
          .addOnFailureListener { fail(operation, errorCode(it)) }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("clearToken") { token: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) promise.reject("E_GMAIL_UNAVAILABLE", "Google authorization is unavailable", null)
      else Identity.getAuthorizationClient(context)
        .clearToken(ClearTokenRequest.builder().setToken(token).build())
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject(errorCode(it), "Could not clear Google authorization", null) }
    }.runOnQueue(Queues.MAIN)

    OnDestroy {
      Handler(Looper.getMainLooper()).post {
        active?.let { fail(it, "E_GMAIL_CANCELLED") }
      }
    }
  }

  private fun start(promise: Promise): Operation? {
    if (active != null) {
      promise.reject("E_GMAIL_BUSY", "Google authorization is already in progress", null)
      return null
    }
    return Operation(promise).also { active = it }
  }

  private fun finishAuthorization(operation: Operation, result: AuthorizationResult) {
    val token = result.accessToken
    val scopes = result.grantedScopes
    if (token.isNullOrBlank() || !scopes.contains(GMAIL_READ_SCOPE)) {
      fail(operation, "E_GMAIL_AUTHORIZATION")
      return
    }
    succeed(operation, mapOf("accessToken" to token, "grantedScopes" to scopes))
  }

  private fun succeed(operation: Operation, value: Any?) {
    if (active !== operation) return
    active = null
    operation.promise.resolve(value)
  }

  private fun fail(operation: Operation, code: String) {
    if (active !== operation) return
    active = null
    // Never forward SDK messages, intents or credential-bearing error payloads to JavaScript.
    operation.promise.reject(code, "Google authorization could not complete", null)
  }

  private fun errorCode(error: Exception): String = when ((error as? ApiException)?.statusCode) {
    CommonStatusCodes.CANCELED -> "E_GMAIL_CANCELLED"
    CommonStatusCodes.NETWORK_ERROR, CommonStatusCodes.TIMEOUT,
    CommonStatusCodes.INTERNAL_ERROR -> "E_GMAIL_NETWORK"
    CommonStatusCodes.SIGN_IN_REQUIRED, CommonStatusCodes.INVALID_ACCOUNT,
    CommonStatusCodes.RESOLUTION_REQUIRED -> "E_GMAIL_AUTHORIZATION"
    CommonStatusCodes.DEVELOPER_ERROR -> "E_GMAIL_UNAVAILABLE"
    else -> "E_GMAIL_UNAVAILABLE"
  }
}
