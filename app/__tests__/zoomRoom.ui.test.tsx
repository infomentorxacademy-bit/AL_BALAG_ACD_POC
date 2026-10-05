import { act, render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

// A stand-in for Zoom's React Native SDK. Like the real one, `useZoom()` hands back a NEW object
// every time the provider re-renders, which is what used to re-trigger the join.
const mockJoin = jest.fn();
const mockInit = jest.fn();
jest.mock('@zoom/meetingsdk-react-native', () => {
  const React = require('react');
  const Ctx = React.createContext(null);
  return {
    ZoomSDKProvider: ({ children }: { children: React.ReactNode }) => {
      const value = { isInitialized: mockInit, joinMeeting: mockJoin };
      return <Ctx.Provider value={{ ...value }}>{children}</Ctx.Provider>;
    },
    useZoom: () => React.useContext(Ctx),
  };
});

import ZoomRoom from '../src/screens/ZoomRoom';

function Harness({ onJoinResult }: { onJoinResult: (r: string) => void }) {
  const [n, setN] = useState(0);
  return (
    <>
      <Pressable onPress={() => setN(n + 1)}>
        <Text>rerender {n}</Text>
      </Pressable>
      {/* A fresh callback on every render, exactly like the app does. */}
      <ZoomRoom jwtToken="JWT" userName="Alice" meetingNumber="81234567890" password="" onJoinResult={(r) => onJoinResult(r)} />
    </>
  );
}

beforeEach(() => {
  mockJoin.mockReset().mockResolvedValue('MEETING_ERROR_SUCCESS');
  mockInit.mockReset().mockResolvedValue(true);
});

test('joins once with the right details and reports Zoom\'s answer', async () => {
  const onJoinResult = jest.fn();
  await render(<Harness onJoinResult={onJoinResult} />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(mockJoin).toHaveBeenCalledTimes(1);
  expect(mockJoin).toHaveBeenCalledWith({ userName: 'Alice', meetingNumber: '81234567890', password: '' });
  expect(onJoinResult).toHaveBeenCalledWith('MEETING_ERROR_SUCCESS');
});

test('re-rendering the app around it never joins a second time', async () => {
  await render(<Harness onJoinResult={() => undefined} />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  const user = userEvent.setup();
  for (let i = 0; i < 4; i++) {
    await user.press(screen.getByText(/rerender/));
  }
  expect(screen.getByText('rerender 4')).toBeTruthy(); // the re-renders really happened
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(mockJoin).toHaveBeenCalledTimes(1);
});

test('waits until the SDK reports it is initialized', async () => {
  mockInit.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
  await render(<Harness onJoinResult={() => undefined} />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 1300));
  });
  expect(mockInit.mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(mockJoin).toHaveBeenCalledTimes(1);
});

test('a thrown error is reported as a failed join, not an unhandled crash', async () => {
  mockJoin.mockRejectedValue(new Error('native exploded'));
  const onJoinResult = jest.fn();
  await render(<Harness onJoinResult={onJoinResult} />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(onJoinResult).toHaveBeenCalledWith(expect.stringContaining('native exploded'));
});
