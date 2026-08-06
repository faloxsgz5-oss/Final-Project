package expo.modules.smartlifelinelistener

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

class SmartLifeLineNotificationService : NotificationListenerService() {
  override fun onListenerConnected() {
    super.onListenerConnected()
    LineNotificationStore(this).markConnected()
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (!SUPPORTED_NOTIFICATION_PACKAGES.contains(sbn.packageName)) return
    val store = LineNotificationStore(this)
    if (!store.isEnabled()) return

    val extras = sbn.notification.extras
    val title = extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
    val text = extras.getCharSequence(android.app.Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
    val combined = "$title $text"
    if (title.isBlank() && text.isBlank()) return
    if (!looksFinancial(combined)) return

    val capturedAt = if (sbn.postTime > 0) sbn.postTime else System.currentTimeMillis()
    val queueCount = store.enqueue(title, text, capturedAt, sbn.packageName)
    LineImportEventBus.listener?.invoke(
      mapOf(
        "capturedAt" to capturedAt,
        "queueCount" to queueCount,
        "sourcePackage" to sbn.packageName,
        "text" to text,
        "title" to title
      )
    )
    showReviewNotification(queueCount)
  }

  private fun looksFinancial(value: String): Boolean {
    return MONEY_SIGNAL.containsMatchIn(value)
  }

  private fun showReviewNotification(queueCount: Int) {
    if (queueCount <= 0) return
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(
          CHANNEL_ID,
          "รายการการเงินจาก LINE",
          NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
          description = "แจ้งเมื่อ SmartLife พบข้อความการเงินจาก LINE ที่รอให้คุณตรวจสอบ"
        }
      )
    }

    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse("smartlife://user/smartlife_line_pending")
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    } ?: return
    val pendingIntent = PendingIntent.getActivity(
      this,
      8451,
      launchIntent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .setContentText("แตะเพื่อตรวจสอบก่อนบันทึก ไม่มีการเพิ่มยอดเงินอัตโนมัติ")
      .setContentTitle("พบรายการการเงินใหม่ $queueCount รายการ")
      .setNumber(queueCount)
      .setOnlyAlertOnce(true)
      // A framework monochrome icon is valid on every supported Android
      // version. Adaptive launcher icons are not valid notification icons.
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .build()
    runCatching {
      NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, notification)
    }
  }

  private companion object {
    const val CHANNEL_ID = "smartlife-line-import"
    const val LINE_PACKAGE = "jp.naver.line.android"
    const val NOTIFICATION_ID = 8451
    val SUPPORTED_NOTIFICATION_PACKAGES = setOf(
      LINE_PACKAGE,
      "com.kasikorn.retail.mbanking.wap",
      "com.kasikornbank.kplus",
      "com.scb.phone",
      "ktbcs.netbank",
      "com.ktb.customer.qr",
      "com.bbl.mobilebanking",
      "com.krungsri.kma",
      "com.ttbbank.ttbtouch",
      "com.tmbbank.tmbtouch"
    )
    val MONEY_SIGNAL = Regex(
      """(?i)(?:[0-9๐-๙][0-9๐-๙,]*(?:\.[0-9๐-๙]{1,2})?\s*(?:บาท|THB)|฿\s*[0-9๐-๙])"""
    )
  }
}
