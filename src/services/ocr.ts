import {getFunctions, httpsCallable} from 'firebase/functions';

import {firebaseApp} from '@/lib/firebase';
import {uploadUserImage, type UploadKind} from '@/services/storage';

export type ScanType = 'auto' | 'receipt' | 'schedule';

export type ScanClassification = {
  confidence: number;
  scores: {receipt: number; schedule: number};
  type: 'receipt' | 'schedule';
};

export type OcrResult = {
  classification: ScanClassification;
  logId: string;
  parsed: Record<string, unknown>;
  rawText: string;
  scanType: 'receipt' | 'schedule';
};

const functions = getFunctions(firebaseApp, 'asia-southeast1');
const analyzeScan = httpsCallable<
  {scanType: ScanType; storagePath: string},
  OcrResult
>(functions, 'analyzeScan');

export async function uploadAndAnalyzeScan({
  contentType = 'image/jpeg',
  scanType,
  uid,
  uri,
}: {
  contentType?: string;
  scanType: ScanType;
  uid: string;
  uri: string;
}) {
  const kind: UploadKind = scanType === 'auto' ? 'scans' : scanType === 'receipt' ? 'receipts' : 'schedules';
  const upload = await uploadUserImage({contentType, kind, uid, uri});
  const response = await analyzeScan({scanType, storagePath: upload.path});
  return {...response.data, downloadUrl: upload.downloadUrl, storagePath: upload.path};
}
