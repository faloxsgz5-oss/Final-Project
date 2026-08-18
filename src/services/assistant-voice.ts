import {getFunctions, httpsCallable} from 'firebase/functions';

import {ensureAppCheckReady} from '@/lib/app-check';
import {firebaseApp} from '@/lib/firebase';

const functions = getFunctions(firebaseApp, 'asia-southeast1');
const transcribeAssistantAudioCall = httpsCallable<
  {audioBase64: string; mimeType: string},
  {transcript: string}
>(functions, 'transcribeAssistantAudio');

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return globalThis.btoa(binary);
}

export async function transcribeAssistantAudio(blob: Blob) {
  if (!blob.size) throw new Error('ไฟล์เสียงว่างเปล่า กรุณาลองพูดใหม่อีกครั้ง');
  if (blob.size > 2 * 1024 * 1024) throw new Error('เสียงยาวเกินไป กรุณาพูดครั้งละไม่เกิน 30 วินาที');
  const mimeType = blob.type.split(';')[0].toLowerCase() || 'audio/webm';
  const audioBase64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  await ensureAppCheckReady();
  const response = await transcribeAssistantAudioCall({audioBase64, mimeType});
  const transcript = response.data.transcript?.trim();
  if (!transcript) throw new Error('ระบบไม่ได้ยินข้อความ กรุณาลองพูดใหม่อีกครั้ง');
  return transcript;
}
