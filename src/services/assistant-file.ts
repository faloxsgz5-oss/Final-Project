import {getFunctions, httpsCallable} from 'firebase/functions';

import {ensureAppCheckReady} from '@/lib/app-check';
import {firebaseApp} from '@/lib/firebase';
import {uploadAssistantFile} from '@/services/storage';

const functions = getFunctions(firebaseApp, 'asia-southeast1');
const analyzeAssistantFileCall = httpsCallable<
  {contentType: string; name: string; storagePath: string},
  {content: string; suggestions?: string[]}
>(functions, 'analyzeAssistantFile');

export async function uploadAndAnalyzeAssistantFile({
  contentType,
  name,
  uid,
  uri,
}: {
  contentType?: string;
  name: string;
  uid: string;
  uri: string;
}) {
  const upload = await uploadAssistantFile({contentType, name, uid, uri});
  await ensureAppCheckReady();
  const response = await analyzeAssistantFileCall({
    contentType: upload.contentType,
    name,
    storagePath: upload.path,
  });
  return {...response.data, storagePath: upload.path};
}
