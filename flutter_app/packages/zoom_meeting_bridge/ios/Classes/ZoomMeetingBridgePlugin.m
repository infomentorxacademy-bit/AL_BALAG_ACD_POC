#import "ZoomMeetingBridgePlugin.h"
#import <MobileRTC/MobileRTC.h>

// Maps an enum constant to its own name, e.g. NAME(MobileRTCAuthError_Success) -> @"MobileRTCAuthError_Success".
#define NAME(x) @(x) : @#x

@interface ZoomMeetingBridgePlugin () <FlutterStreamHandler, MobileRTCAuthDelegate, MobileRTCMeetingServiceDelegate>
@property(nonatomic, strong) FlutterEventSink eventSink;
@end

@implementation ZoomMeetingBridgePlugin

+ (void)registerWithRegistrar:(NSObject<FlutterPluginRegistrar> *)registrar {
  ZoomMeetingBridgePlugin *instance = [[ZoomMeetingBridgePlugin alloc] init];
  FlutterMethodChannel *channel = [FlutterMethodChannel methodChannelWithName:@"zoom_meeting_bridge"
                                                              binaryMessenger:[registrar messenger]];
  [registrar addMethodCallDelegate:instance channel:channel];
  FlutterEventChannel *events = [FlutterEventChannel eventChannelWithName:@"zoom_meeting_bridge/events"
                                                          binaryMessenger:[registrar messenger]];
  [events setStreamHandler:instance];
}

#pragma mark - FlutterStreamHandler

- (FlutterError *)onListenWithArguments:(id)arguments eventSink:(FlutterEventSink)events {
  self.eventSink = events;
  return nil;
}

- (FlutterError *)onCancelWithArguments:(id)arguments {
  self.eventSink = nil;
  return nil;
}

- (void)emit:(NSDictionary *)event {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.eventSink) {
      self.eventSink(event);
    }
  });
}

#pragma mark - FlutterPlugin

- (void)handleMethodCall:(FlutterMethodCall *)call result:(FlutterResult)result {
  if ([@"initialize" isEqualToString:call.method]) {
    [self initializeWithArgs:call.arguments result:result];
  } else if ([@"isInitialized" isEqualToString:call.method]) {
    result(@([[MobileRTC sharedRTC] getMeetingService] != nil));
  } else if ([@"joinMeeting" isEqualToString:call.method]) {
    [self joinMeetingWithArgs:call.arguments result:result];
  } else if ([@"uninitialize" isEqualToString:call.method]) {
    result(nil);  // The iOS SDK has no explicit uninitialize; nothing to do.
  } else {
    result(FlutterMethodNotImplemented);
  }
}

- (void)initializeWithArgs:(NSDictionary *)args result:(FlutterResult)result {
  NSString *jwt = args[@"jwtToken"];
  if (jwt.length == 0) {
    result([FlutterError errorWithCode:@"invalid_args" message:@"jwtToken is required" details:nil]);
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    MobileRTCSDKInitContext *context = [[MobileRTCSDKInitContext alloc] init];
    context.domain = args[@"domain"] ?: @"zoom.us";
    context.enableLog = [args[@"enableLog"] boolValue];
    context.wrapperType = 2;  // Same value Zoom's own React Native wrapper reports.

    BOOL ok = [[MobileRTC sharedRTC] initialize:context];
    if (ok) {
      MobileRTCAuthService *auth = [[MobileRTC sharedRTC] getAuthService];
      if (auth) {
        auth.jwtToken = jwt;
        auth.delegate = self;
        [auth sdkAuth];
      }
    }
    result(@(ok));
  });
}

- (void)joinMeetingWithArgs:(NSDictionary *)args result:(FlutterResult)result {
  dispatch_async(dispatch_get_main_queue(), ^{
    MobileRTCMeetingService *service = [[MobileRTC sharedRTC] getMeetingService];
    if (!service) {
      result([FlutterError errorWithCode:@"not_ready"
                                 message:@"Zoom SDK is not initialized yet. Wait for a successful auth event first."
                                 details:nil]);
      return;
    }
    MobileRTCMeetingJoinParam *params = [[MobileRTCMeetingJoinParam alloc] init];
    params.meetingNumber = args[@"meetingNumber"];
    params.userName = args[@"displayName"];
    params.password = args[@"password"];
    params.noAudio = [args[@"noAudio"] boolValue];
    params.noVideo = [args[@"noVideo"] boolValue];

    MobileRTCMeetError code = [service joinMeetingWithJoinParam:params];
    result(@{@"code" : @(code), @"name" : [ZoomMeetingBridgePlugin meetErrorName:code]});
  });
}

#pragma mark - MobileRTCAuthDelegate

- (void)onMobileRTCAuthReturn:(MobileRTCAuthError)returnValue {
  if (returnValue == MobileRTCAuthError_Success) {
    MobileRTCMeetingService *service = [[MobileRTC sharedRTC] getMeetingService];
    if (service) {
      service.delegate = self;
    }
  }
  [self emit:@{
    @"type" : @"auth",
    @"code" : @(returnValue),
    @"name" : [ZoomMeetingBridgePlugin authErrorName:returnValue],
  }];
}

- (void)onMobileRTCAuthExpired {
  [self emit:@{@"type" : @"authExpired"}];
}

#pragma mark - MobileRTCMeetingServiceDelegate

- (void)onMeetingStateChange:(MobileRTCMeetingState)state {
  [self emit:@{
    @"type" : @"meetingStatus",
    @"status" : [ZoomMeetingBridgePlugin stateName:state],
    @"code" : @0,
    @"name" : @"MobileRTCMeetError_Success",
  }];
}

- (void)onMeetingError:(MobileRTCMeetError)error message:(NSString *)message {
  [self emit:@{
    @"type" : @"meetingStatus",
    @"status" : @"Failed",
    @"code" : @(error),
    @"name" : [ZoomMeetingBridgePlugin meetErrorName:error],
  }];
}

#pragma mark - Name lookups (only constants that exist in the SDK headers)

+ (NSString *)authErrorName:(MobileRTCAuthError)value {
  static NSDictionary *names;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    names = @{
      NAME(MobileRTCAuthError_Success),
      NAME(MobileRTCAuthError_KeyOrSecretEmpty),
      NAME(MobileRTCAuthError_KeyOrSecretWrong),
      NAME(MobileRTCAuthError_AccountNotSupport),
      NAME(MobileRTCAuthError_AccountNotEnableSDK),
      NAME(MobileRTCAuthError_ServiceBusy),
      NAME(MobileRTCAuthError_OverTime),
      NAME(MobileRTCAuthError_NetworkIssue),
      NAME(MobileRTCAuthError_ClientIncompatible),
      NAME(MobileRTCAuthError_TokenWrong),
      NAME(MobileRTCAuthError_LimitExceededException),
    };
  });
  return names[@(value)] ?: [NSString stringWithFormat:@"MobileRTCAuthError_%ld", (long)value];
}

+ (NSString *)meetErrorName:(MobileRTCMeetError)value {
  static NSDictionary *names;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    names = @{
      NAME(MobileRTCMeetError_Success),
      NAME(MobileRTCMeetError_ConnectionError),
      NAME(MobileRTCMeetError_PasswordError),
      NAME(MobileRTCMeetError_SessionError),
      NAME(MobileRTCMeetError_MeetingOver),
      NAME(MobileRTCMeetError_MeetingNotStart),
      NAME(MobileRTCMeetError_MeetingNotExist),
      NAME(MobileRTCMeetError_MeetingUserFull),
      NAME(MobileRTCMeetError_MeetingClientIncompatible),
      NAME(MobileRTCMeetError_MeetingLocked),
      NAME(MobileRTCMeetError_MeetingRestricted),
      NAME(MobileRTCMeetError_RemovedByHost),
      NAME(MobileRTCMeetError_HostDisallowOutsideUserJoin),
      NAME(MobileRTCMeetError_UnableToJoinExternalMeeting),
      NAME(MobileRTCMeetError_BlockedByAccountAdmin),
      NAME(MobileRTCMeetError_NeedSignInForPrivateMeeting),
      NAME(MobileRTCMeetError_InvalidArguments),
      NAME(MobileRTCMeetError_InAnotherMeeting),
      NAME(MobileRTCMeetError_AppCanNotAnonymousJoinMeeting),
      NAME(MobileRTCMeetError_Failed),
      NAME(MobileRTCMeetError_Unknown),
    };
  });
  return names[@(value)] ?: [NSString stringWithFormat:@"MobileRTCMeetError_%ld", (long)value];
}

+ (NSString *)stateName:(MobileRTCMeetingState)state {
  switch (state) {
    case MobileRTCMeetingState_Idle: return @"Idle";
    case MobileRTCMeetingState_Connecting: return @"Connecting";
    case MobileRTCMeetingState_WaitingForHost: return @"WaitingForHost";
    case MobileRTCMeetingState_InMeeting: return @"InMeeting";
    case MobileRTCMeetingState_Disconnecting: return @"Disconnecting";
    case MobileRTCMeetingState_Reconnecting: return @"Reconnecting";
    case MobileRTCMeetingState_Failed: return @"Failed";
    case MobileRTCMeetingState_Ended: return @"Ended";
    case MobileRTCMeetingState_InWaitingRoom: return @"InWaitingRoom";
    default: return @"Unknown";
  }
}

@end
