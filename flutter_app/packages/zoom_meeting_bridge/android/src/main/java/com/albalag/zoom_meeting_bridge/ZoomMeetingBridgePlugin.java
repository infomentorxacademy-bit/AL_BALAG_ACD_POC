package com.albalag.zoom_meeting_bridge;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.HashMap;
import java.util.Map;

import io.flutter.embedding.engine.plugins.FlutterPlugin;
import io.flutter.embedding.engine.plugins.activity.ActivityAware;
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding;
import io.flutter.plugin.common.EventChannel;
import io.flutter.plugin.common.MethodCall;
import io.flutter.plugin.common.MethodChannel;
import io.flutter.plugin.common.MethodChannel.MethodCallHandler;
import io.flutter.plugin.common.MethodChannel.Result;

import us.zoom.sdk.CustomizedMiniMeetingViewSize;
import us.zoom.sdk.JoinMeetingOptions;
import us.zoom.sdk.JoinMeetingParam4WithoutLogin;
import us.zoom.sdk.MeetingError;
import us.zoom.sdk.MeetingParameter;
import us.zoom.sdk.MeetingService;
import us.zoom.sdk.MeetingServiceListener;
import us.zoom.sdk.MeetingStatus;
import us.zoom.sdk.SimpleZoomUIDelegate;
import us.zoom.sdk.ZoomError;
import us.zoom.sdk.ZoomSDK;
import us.zoom.sdk.ZoomSDKInitParams;
import us.zoom.sdk.ZoomSDKInitializeListener;
import us.zoom.sdk.ZoomUIService;

/**
 * Bridges the official Zoom Meeting SDK to Flutter.
 *
 * Mirrors the call sequence of Zoom's own React Native wrapper:
 * initialize(jwt) -> onZoomSDKInitializeResult -> joinMeetingWithParams.
 */
public class ZoomMeetingBridgePlugin
    implements FlutterPlugin, MethodCallHandler, ActivityAware, EventChannel.StreamHandler {

  // Zoom's interfaces are deliberately NOT supertypes of this class: the app module compiles
  // against this class (GeneratedPluginRegistrant) but does not see the Zoom SDK classpath.

  private static final String TAG = "ZoomMeetingBridge";

  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  private final ZoomSDKInitializeListener initListener = new ZoomSDKInitializeListener() {
    @Override
    public void onZoomSDKInitializeResult(int errorCode, int internalErrorCode) {
      handleInitResult(errorCode, internalErrorCode);
    }

    @Override
    public void onZoomAuthIdentityExpired() {
      Map<String, Object> event = new HashMap<>();
      event.put("type", "authExpired");
      emit(event);
    }
  };

  private final MeetingServiceListener meetingListener = new MeetingServiceListener() {
    @Override
    public void onMeetingStatusChanged(MeetingStatus status, int errorCode, int internalErrorCode) {
      handleMeetingStatus(status, errorCode, internalErrorCode);
    }

    @Override
    public void onMeetingParameterNotification(MeetingParameter meetingParameter) {
      // Not needed for this bridge.
    }
  };

  // Tells Dart when the user minimizes the meeting (Zoom then shows its small floating window).
  private final SimpleZoomUIDelegate uiDelegate = new SimpleZoomUIDelegate() {
    @Override
    public void afterMeetingMinimized(Activity minimizedActivity) {
      Map<String, Object> event = new HashMap<>();
      event.put("type", "minimized");
      emit(event);
    }
  };

  private MethodChannel methodChannel;
  private EventChannel eventChannel;
  private EventChannel.EventSink eventSink;
  private Context appContext;
  @Nullable private Activity activity;

  @Override
  public void onAttachedToEngine(@NonNull FlutterPluginBinding binding) {
    appContext = binding.getApplicationContext();
    methodChannel = new MethodChannel(binding.getBinaryMessenger(), "zoom_meeting_bridge");
    methodChannel.setMethodCallHandler(this);
    eventChannel = new EventChannel(binding.getBinaryMessenger(), "zoom_meeting_bridge/events");
    eventChannel.setStreamHandler(this);
  }

  @Override
  public void onDetachedFromEngine(@NonNull FlutterPluginBinding binding) {
    methodChannel.setMethodCallHandler(null);
    eventChannel.setStreamHandler(null);
    methodChannel = null;
    eventChannel = null;
    appContext = null;
  }

  // ---- ActivityAware: the Zoom UI must be launched from an Activity context ----

  @Override
  public void onAttachedToActivity(@NonNull ActivityPluginBinding binding) {
    activity = binding.getActivity();
  }

  @Override
  public void onDetachedFromActivityForConfigChanges() {
    activity = null;
  }

  @Override
  public void onReattachedToActivityForConfigChanges(@NonNull ActivityPluginBinding binding) {
    activity = binding.getActivity();
  }

  @Override
  public void onDetachedFromActivity() {
    activity = null;
  }

  // ---- EventChannel ----

  @Override
  public void onListen(Object arguments, EventChannel.EventSink events) {
    eventSink = events;
  }

  @Override
  public void onCancel(Object arguments) {
    eventSink = null;
  }

  private void emit(final Map<String, Object> event) {
    mainHandler.post(() -> {
      if (eventSink != null) {
        eventSink.success(event);
      }
    });
  }

  // ---- MethodChannel ----

  @Override
  public void onMethodCall(@NonNull MethodCall call, @NonNull Result result) {
    switch (call.method) {
      case "initialize":
        initialize(call, result);
        break;
      case "isInitialized":
        result.success(ZoomSDK.getInstance().isInitialized());
        break;
      case "joinMeeting":
        joinMeeting(call, result);
        break;
      case "canDrawOverlays":
        result.success(Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(uiContext()));
        break;
      case "requestOverlayPermission":
        requestOverlayPermission(result);
        break;
      case "returnToMeeting":
        returnToMeeting(result);
        break;
      case "meetingState":
        meetingState(result);
        break;
      case "uninitialize":
        mainHandler.post(() -> {
          ZoomSDK.getInstance().uninitialize();
          result.success(null);
        });
        break;
      default:
        result.notImplemented();
    }
  }

  private Context uiContext() {
    return activity != null ? activity : appContext;
  }

  private void initialize(final MethodCall call, final Result result) {
    final String jwt = call.argument("jwtToken");
    if (jwt == null || jwt.isEmpty()) {
      result.error("invalid_args", "jwtToken is required", null);
      return;
    }
    final String domain = call.argument("domain");
    final Boolean enableLog = call.argument("enableLog");

    mainHandler.post(() -> {
      try {
        ZoomSDKInitParams params = new ZoomSDKInitParams();
        params.jwtToken = jwt;
        params.domain = domain != null ? domain : "zoom.us";
        params.enableLog = enableLog == null || enableLog;
        params.logSize = 5;
        params.enableGenerateDump = true;
        // Zoom's own React Native wrapper reports wrapperType 2; Flutter has no dedicated value.
        params.wrapperType = 2;
        ZoomSDK.getInstance().initialize(uiContext(), initListener, params);
        result.success(true);
      } catch (Exception e) {
        Log.e(TAG, "initialize failed", e);
        result.error("init_failed", e.getMessage(), null);
      }
    });
  }

  /** Opens the system screen where the user can allow "Display over other apps" for this app. */
  private void requestOverlayPermission(final Result result) {
    try {
      Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:" + uiContext().getPackageName()));
      if (activity == null) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      }
      uiContext().startActivity(intent);
      result.success(true);
    } catch (Exception e) {
      Log.e(TAG, "requestOverlayPermission failed", e);
      result.error("overlay_failed", e.getMessage(), null);
    }
  }

  /** Brings the running meeting back to full screen (from the floating window or from the app). */
  private void returnToMeeting(final Result result) {
    mainHandler.post(() -> {
      try {
        MeetingService meetingService = ZoomSDK.getInstance().getMeetingService();
        if (meetingService == null) {
          result.error("not_ready", "Zoom SDK is not initialized.", null);
          return;
        }
        meetingService.returnToMeeting(uiContext());
        result.success(true);
      } catch (Exception e) {
        Log.e(TAG, "returnToMeeting failed", e);
        result.error("return_failed", e.getMessage(), null);
      }
    });
  }

  /** The current meeting state, e.g. "InMeeting" or "Idle". */
  private void meetingState(final Result result) {
    mainHandler.post(() -> {
      MeetingService meetingService = ZoomSDK.getInstance().getMeetingService();
      result.success(meetingService == null ? "Idle" : statusName(meetingService.getMeetingStatus()));
    });
  }

  private void joinMeeting(final MethodCall call, final Result result) {
    final String meetingNumber = call.argument("meetingNumber");
    final String displayName = call.argument("displayName");
    final String password = call.argument("password");
    final Boolean noAudio = call.argument("noAudio");
    final Boolean noVideo = call.argument("noVideo");

    mainHandler.post(() -> {
      try {
        MeetingService meetingService = ZoomSDK.getInstance().getMeetingService();
        if (meetingService == null) {
          result.error("not_ready",
              "Zoom SDK is not initialized yet. Wait for a successful auth event first.", null);
          return;
        }

        JoinMeetingOptions options = new JoinMeetingOptions();
        options.no_audio = noAudio != null && noAudio;
        options.no_video = noVideo != null && noVideo;

        JoinMeetingParam4WithoutLogin params = new JoinMeetingParam4WithoutLogin();
        params.meetingNo = meetingNumber;
        params.displayName = displayName;
        params.password = password;

        int code = meetingService.joinMeetingWithParams(uiContext(), params, options);
        result.success(codeMap(code, constantName(MeetingError.class, code, "MEETING_ERROR_")));
      } catch (Exception e) {
        Log.e(TAG, "joinMeeting failed", e);
        result.error("join_failed", e.getMessage(), null);
      }
    });
  }

  // ---- Zoom callbacks (see the listener fields above) ----

  private void handleInitResult(int errorCode, int internalErrorCode) {
    Log.d(TAG, "onZoomSDKInitializeResult " + errorCode + "/" + internalErrorCode);
    if (errorCode == ZoomError.ZOOM_ERROR_SUCCESS) {
      MeetingService meetingService = ZoomSDK.getInstance().getMeetingService();
      if (meetingService != null) {
        meetingService.addListener(meetingListener);
      }
      configureMiniWindow();
    }
    Map<String, Object> event = new HashMap<>();
    event.put("type", "auth");
    event.put("code", errorCode);
    event.put("name", constantName(ZoomError.class, errorCode, "ZOOM_ERROR_"));
    event.put("internalCode", internalErrorCode);
    emit(event);
  }

  /** Lets the user minimize the meeting to a small floating window and use the app meanwhile. */
  private void configureMiniWindow() {
    ZoomUIService ui = ZoomSDK.getInstance().getZoomUIService();
    if (ui == null) {
      return;
    }
    ui.enableMinimizeMeeting(true);
    float density = uiContext().getResources().getDisplayMetrics().density;
    // Constructor order is (topMargin, rightMargin, width, height), in pixels.
    ui.setMiniMeetingViewSize(new CustomizedMiniMeetingViewSize(
        (int) (96 * density), (int) (12 * density), (int) (112 * density), (int) (152 * density)));
    ui.setZoomUIDelegate(uiDelegate);
  }

  private void handleMeetingStatus(MeetingStatus status, int errorCode, int internalErrorCode) {
    Log.d(TAG, "onMeetingStatusChanged " + status + " " + errorCode + "/" + internalErrorCode);
    Map<String, Object> event = new HashMap<>();
    event.put("type", "meetingStatus");
    event.put("status", statusName(status));
    event.put("code", errorCode);
    event.put("name", constantName(MeetingError.class, errorCode, "MEETING_ERROR_"));
    event.put("internalCode", internalErrorCode);
    emit(event);
  }

  // ---- helpers ----

  private static Map<String, Object> codeMap(int code, String name) {
    Map<String, Object> map = new HashMap<>();
    map.put("code", code);
    map.put("name", name);
    return map;
  }

  /** "MEETING_STATUS_IN_WAITING_ROOM" -> "InWaitingRoom"-style names match the RN wrapper loosely. */
  private static String statusName(MeetingStatus status) {
    if (status == null) {
      return "Unknown";
    }
    switch (status) {
      case MEETING_STATUS_IDLE: return "Idle";
      case MEETING_STATUS_CONNECTING: return "Connecting";
      case MEETING_STATUS_WAITINGFORHOST: return "WaitingForHost";
      case MEETING_STATUS_INMEETING: return "InMeeting";
      case MEETING_STATUS_DISCONNECTING: return "Disconnecting";
      case MEETING_STATUS_RECONNECTING: return "Reconnecting";
      case MEETING_STATUS_FAILED: return "Failed";
      case MEETING_STATUS_ENDED: return "Ended";
      case MEETING_STATUS_IN_WAITING_ROOM: return "InWaitingRoom";
      default: return status.name();
    }
  }

  /** Finds the constant name for an int code by reflecting over the SDK's error interface. */
  private static String constantName(Class<?> holder, int code, String prefix) {
    for (Field field : holder.getFields()) {
      if (field.getType() == int.class
          && Modifier.isStatic(field.getModifiers())
          && field.getName().startsWith(prefix)) {
        try {
          if (field.getInt(null) == code) {
            return field.getName();
          }
        } catch (IllegalAccessException ignored) {
          // Public constants; cannot happen.
        }
      }
    }
    return prefix + "UNKNOWN_" + code;
  }
}
