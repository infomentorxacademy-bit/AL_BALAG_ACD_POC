import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { ZoomSDKProvider, useZoom } from '@zoom/meetingsdk-react-native';

type Props = {
  jwtToken: string;
  userName: string;
  meetingNumber: string;
  password: string;
};

function Joiner({ userName, meetingNumber, password }: Omit<Props, 'jwtToken'>) {
  const zoom = useZoom();
  const [status, setStatus] = useState('Initializing Zoom SDK…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // The provider initializes the native SDK on mount; wait until it is ready.
        for (let i = 0; i < 20 && !(await zoom.isInitialized()); i++) {
          await new Promise((r) => setTimeout(r, 500));
        }
        if (cancelled) return;
        setStatus('Joining meeting…');
        const result = await zoom.joinMeeting({ userName, meetingNumber, password });
        if (!cancelled) setStatus(`Join result: ${String(result)}`);
      } catch (e) {
        if (!cancelled) setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zoom, userName, meetingNumber, password]);

  return (
    <>
      <ActivityIndicator style={styles.spinner} />
      <Text style={styles.status}>{status}</Text>
    </>
  );
}

export default function ZoomRoom({ jwtToken, ...rest }: Props) {
  return (
    <ZoomSDKProvider config={{ jwtToken, domain: 'zoom.us', enableLog: true, logSize: 5 }}>
      <Joiner {...rest} />
    </ZoomSDKProvider>
  );
}

const styles = StyleSheet.create({
  spinner: { marginTop: 24 },
  status: { textAlign: 'center', marginTop: 12, color: '#445' },
});
