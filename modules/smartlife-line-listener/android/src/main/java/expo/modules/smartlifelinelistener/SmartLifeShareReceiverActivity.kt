package expo.modules.smartlifelinelistener

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

class SmartLifeShareReceiverActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
      val sharedText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim().orEmpty()
      if (sharedText.isNotBlank()) {
        LineNotificationStore(this).setSharedText(sharedText)
      }
    }

    packageManager.getLaunchIntentForPackage(packageName)?.apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse("smartlife://user/smartlife_line_import?shared=1")
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      startActivity(this)
    }
    finish()
  }
}
