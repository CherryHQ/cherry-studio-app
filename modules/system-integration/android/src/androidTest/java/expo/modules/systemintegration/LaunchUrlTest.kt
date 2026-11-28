package expo.modules.systemintegration

import android.content.Intent
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LaunchUrlTest {
  private val account = "cherrystudio://auth/callback?code=cold"
  private val other = "cherrystudio://uu-remote/callback?request=new"

  @Test fun handledViewHasNoInitialUrlForASecondRuntime() {
    val launch = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(Uri.parse(account), "text/plain")
      putExtra("keep", 7)
    }
    consumeLaunchUrl(launch, account)
    assertNull(launch.data)
    assertEquals(Intent.ACTION_VIEW, launch.action)
    assertEquals("text/plain", launch.type)
    assertEquals(7, launch.getIntExtra("keep", 0))
  }

  @Test fun aNewerLaunchSurvivesAnOlderCallbackAcknowledgement() {
    val launch = Intent(Intent.ACTION_VIEW, Uri.parse(other))
    consumeLaunchUrl(launch, account)
    assertEquals(other, launch.dataString)
  }
}
