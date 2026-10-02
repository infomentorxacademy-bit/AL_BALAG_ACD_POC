import { config } from '../config';

/** Asks the backend to sign a Meeting SDK JWT (the SDK secret must never live in the app). */
export async function fetchZoomSignature(meetingNumber: string, role = 0): Promise<string> {
  const res = await fetch(`${config.apiBaseUrl}/zoom/signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meeting_number: meetingNumber, role }),
  });
  if (!res.ok) throw new Error(`Signature request failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { signature: string };
  return data.signature;
}
