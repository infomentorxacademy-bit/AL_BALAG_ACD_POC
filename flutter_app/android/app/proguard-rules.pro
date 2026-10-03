# App-level R8 rules (release builds).
#
# Zoom Meeting SDK: the keep rules ship with the zoom_meeting_bridge plugin. These duplicate the
# "ignore missing optional classes" part so a release build never fails on classes that don't exist on Android.
-dontwarn com.google.api.client.http.**
-dontwarn com.google.zxing.**
-dontwarn org.joda.time.**
-dontwarn java.awt.**
-dontwarn javax.swing.**
-dontwarn kotlinx.coroutines.swing.**
