import { config } from '../config';
import { normalizeBaseUrl } from '../logic';

/** Asks the backend to sign a Meeting SDK JWT (the SDK secret must never live in the app). */
export async function fetchZoomSignature(
  meetingNumber: string,
  role = 0,
  baseUrl: string = config.apiBaseUrl,
): Promise<string> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/zoom/signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meeting_number: meetingNumber, role }),
  });
  if (!res.ok) throw new Error(`Signature request failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { signature: string };
  return data.signature;
}
