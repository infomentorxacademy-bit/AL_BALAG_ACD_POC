# Zoom Meeting SDK: keep SDK classes that are reached through reflection/JNI.
-keep class us.zoom.** { *; }
-keep interface us.zoom.** { *; }
-keep class com.zipow.** { *; }
-keep class us.zipow.** { *; }
-keep class org.webrtc.** { *; }
-keep class com.google.crypto.tink.** { *; }
-keep class androidx.security.crypto.** { *; }
-dontwarn us.zoom.**
-dontwarn com.zipow.**

# Optional / desktop-only classes referenced by Zoom's dependencies. They are never reached on Android,
# so R8 must not fail the release build because they are missing.
-dontwarn com.google.api.client.http.**
-dontwarn com.google.zxing.**
-dontwarn org.joda.time.**
-dontwarn java.awt.**
-dontwarn javax.swing.**
-dontwarn kotlinx.coroutines.swing.**
