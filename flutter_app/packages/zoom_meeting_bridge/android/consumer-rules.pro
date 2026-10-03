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
