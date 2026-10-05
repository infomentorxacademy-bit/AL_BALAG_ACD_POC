import { memo, useEffect, useRef } from 'react';
import { ZoomSDKProvider, useZoom } from '@zoom/meetingsdk-react-native';

type Props = {
  jwtToken: string;
  userName: string;
  meetingNumber: string;
  password: string;
  /** Called once with Zoom's answer to the join request (e.g. "MEETING_ERROR_SUCCESS"). */
  onJoinResult: (result: string) => void;
};

function Joiner({ userName, meetingNumber, password, onJoinResult }: Omit<Props, 'jwtToken'>) {
  const zoom = useZoom();
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  // The host stays mounted for the whole meeting while the rest of the app re-renders around it:
  // join exactly once, never on a re-render.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        // The provider initializes the native SDK on mount; wait until it is ready.
        for (let i = 0; i < 40 && !(await zoomRef.current.isInitialized()); i++) {
          await new Promise((r) => setTimeout(r, 500));
        }
        const result = await zoomRef.current.joinMeeting({ userName, meetingNumber, password });
        onJoinResult(String(result));
      } catch (e) {
        onJoinResult(`MEETING_ERROR_EXCEPTION: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/** Invisible: initializes Zoom and joins the meeting. The meeting UI itself is Zoom's own screen. */
function ZoomRoom({ jwtToken, ...rest }: Props) {
  return (
    <ZoomSDKProvider config={{ jwtToken, domain: 'zoom.us', enableLog: true, logSize: 5 }}>
      <Joiner {...rest} />
    </ZoomSDKProvider>
  );
}

export default memo(ZoomRoom);
