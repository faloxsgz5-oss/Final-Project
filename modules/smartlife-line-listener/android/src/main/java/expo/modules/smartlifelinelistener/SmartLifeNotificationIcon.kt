package expo.modules.smartlifelinelistener

import android.content.Context

/**
 * The SmartLife logo as a notification small icon: the white silhouette that
 * expo-notifications generates from app.json ("notification_icon"), so these
 * native notifications show the same mark as the app's others. Falls back to
 * a framework icon if a build was made without it.
 */
internal fun Context.smartLifeNotificationIcon(fallback: Int): Int {
  @Suppress("DiscouragedApi")
  val id = resources.getIdentifier("notification_icon", "drawable", packageName)
  return if (id != 0) id else fallback
}
