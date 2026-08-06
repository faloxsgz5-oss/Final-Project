package expo.modules.smartlifelinelistener

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class CapturedLineNotification(
  val capturedAt: Long,
  val id: String,
  val sourcePackage: String,
  val text: String,
  val title: String
)

internal object LineImportEventBus {
  @Volatile
  var listener: ((Map<String, Any>) -> Unit)? = null
}

internal class LineNotificationStore(context: Context) {
  private val appContext = context.applicationContext
  private val preferences = appContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  fun isEnabled(): Boolean = preferences.getBoolean(KEY_ENABLED, false)

  @Synchronized
  fun setEnabled(enabled: Boolean, userId: String) {
    preferences.edit()
      .putBoolean(KEY_ENABLED, enabled)
      .putString(KEY_ACTIVE_USER, if (enabled) userId else "")
      .apply()
    if (!enabled) {
      clearNotifications()
    }
  }

  fun activeUserId(): String = preferences.getString(KEY_ACTIVE_USER, "") ?: ""

  fun markConnected(at: Long = System.currentTimeMillis()) {
    preferences.edit().putLong(KEY_LAST_CONNECTED, at).apply()
  }

  fun markNotification(at: Long = System.currentTimeMillis()) {
    preferences.edit().putLong(KEY_LAST_NOTIFICATION, at).apply()
  }

  fun lastConnectedAt(): Long = preferences.getLong(KEY_LAST_CONNECTED, 0)

  fun lastNotificationAt(): Long = preferences.getLong(KEY_LAST_NOTIFICATION, 0)

  @Synchronized
  fun enqueue(title: String, text: String, capturedAt: Long, sourcePackage: String): Int {
    val userId = activeUserId()
    if (!isEnabled() || userId.isBlank()) return notificationCount()

    val payload = JSONObject()
      .put("text", text.take(MAX_TEXT_LENGTH))
      .put("title", title.take(MAX_TITLE_LENGTH))
      .toString()
    val encrypted = encrypt(payload)
    val queue = readQueue()
    prune(queue, capturedAt)
    queue.put(
      JSONObject()
        .put("capturedAt", capturedAt)
        .put("ciphertext", encrypted.second)
        .put("id", UUID.randomUUID().toString())
        .put("iv", encrypted.first)
        .put("sourcePackage", sourcePackage)
        .put("userId", userId)
    )
    while (queue.length() > MAX_QUEUE_SIZE) {
      queue.remove(0)
    }
    writeQueue(queue)
    markNotification(capturedAt)
    return queue.length()
  }

  @Synchronized
  fun listNotifications(userId: String): List<CapturedLineNotification> {
    val now = System.currentTimeMillis()
    val queue = readQueue()
    val changed = prune(queue, now)
    val results = mutableListOf<CapturedLineNotification>()
    for (index in 0 until queue.length()) {
      val item = queue.optJSONObject(index) ?: continue
      if (item.optString("userId") != userId) continue
      val payload = decrypt(item.optString("iv"), item.optString("ciphertext")) ?: continue
      val json = runCatching { JSONObject(payload) }.getOrNull() ?: continue
      results.add(
        CapturedLineNotification(
          capturedAt = item.optLong("capturedAt", now),
          id = item.optString("id"),
          sourcePackage = item.optString("sourcePackage", "jp.naver.line.android"),
          text = json.optString("text"),
          title = json.optString("title")
        )
      )
    }
    if (changed) writeQueue(queue)
    return results
  }

  @Synchronized
  fun acknowledge(ids: Set<String>) {
    if (ids.isEmpty()) return
    val queue = readQueue()
    val kept = JSONArray()
    for (index in 0 until queue.length()) {
      val item = queue.optJSONObject(index) ?: continue
      if (!ids.contains(item.optString("id"))) kept.put(item)
    }
    writeQueue(kept)
  }

  @Synchronized
  fun clearNotifications() {
    preferences.edit().remove(KEY_QUEUE).apply()
  }

  @Synchronized
  fun notificationCount(): Int {
    val queue = readQueue()
    if (prune(queue, System.currentTimeMillis())) writeQueue(queue)
    return queue.length()
  }

  @Synchronized
  fun setSharedText(text: String) {
    val encrypted = encrypt(text.take(MAX_SHARED_TEXT_LENGTH))
    preferences.edit().putString(
      KEY_SHARED_TEXT,
      JSONObject()
        .put("capturedAt", System.currentTimeMillis())
        .put("ciphertext", encrypted.second)
        .put("iv", encrypted.first)
        .toString()
    ).apply()
  }

  @Synchronized
  fun consumeSharedText(): String? {
    val stored = preferences.getString(KEY_SHARED_TEXT, null) ?: return null
    preferences.edit().remove(KEY_SHARED_TEXT).apply()
    val json = runCatching { JSONObject(stored) }.getOrNull() ?: return null
    if (System.currentTimeMillis() - json.optLong("capturedAt") > RETENTION_MILLIS) return null
    return decrypt(json.optString("iv"), json.optString("ciphertext"))
  }

  private fun readQueue(): JSONArray {
    val stored = preferences.getString(KEY_QUEUE, null) ?: return JSONArray()
    return runCatching { JSONArray(stored) }.getOrDefault(JSONArray())
  }

  private fun writeQueue(queue: JSONArray) {
    preferences.edit().putString(KEY_QUEUE, queue.toString()).apply()
  }

  private fun prune(queue: JSONArray, now: Long): Boolean {
    var changed = false
    var index = queue.length() - 1
    while (index >= 0) {
      val capturedAt = queue.optJSONObject(index)?.optLong("capturedAt", 0) ?: 0
      if (capturedAt <= 0 || now - capturedAt > RETENTION_MILLIS) {
        queue.remove(index)
        changed = true
      }
      index -= 1
    }
    return changed
  }

  private fun encrypt(plainText: String): Pair<String, String> {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, secretKey())
    val ciphertext = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) to
      Base64.encodeToString(ciphertext, Base64.NO_WRAP)
  }

  private fun decrypt(iv: String, ciphertext: String): String? = runCatching {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(
      Cipher.DECRYPT_MODE,
      secretKey(),
      GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))
    )
    String(cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP)), Charsets.UTF_8)
  }.getOrNull()

  private fun secretKey(): SecretKey {
    val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
    generator.init(
      KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_DECRYPT or KeyProperties.PURPOSE_ENCRYPT
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build()
    )
    return generator.generateKey()
  }

  private companion object {
    const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    const val KEY_ACTIVE_USER = "active_user"
    const val KEY_ALIAS = "smartlife_line_notification_queue_v1"
    const val KEY_ENABLED = "enabled"
    const val KEY_LAST_CONNECTED = "last_connected"
    const val KEY_LAST_NOTIFICATION = "last_notification"
    const val KEY_QUEUE = "notification_queue"
    const val KEY_SHARED_TEXT = "shared_text"
    const val MAX_QUEUE_SIZE = 50
    const val MAX_SHARED_TEXT_LENGTH = 50_000
    const val MAX_TEXT_LENGTH = 8_000
    const val MAX_TITLE_LENGTH = 500
    const val PREFERENCES_NAME = "smartlife_line_import"
    const val RETENTION_MILLIS = 7L * 24L * 60L * 60L * 1000L
    const val TRANSFORMATION = "AES/GCM/NoPadding"
  }
}
