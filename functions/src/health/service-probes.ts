/**
 * Real connectivity probes for every external service SmartLife talks to.
 *
 * Every probe performs an actual network / SDK call and reports what came
 * back, so a service that is down, unconfigured, or out of quota shows up as
 * `degraded` / `outage` instead of a decorative green dot.
 *
 * Secrets are never returned. Probes send API keys in request *headers* only
 * (never in a query string, so no URL echoed back inside an error can carry
 * one) and every string that leaves this module is passed through `redact()`.
 */
import {getAuth} from "firebase-admin/auth";
import {getMessaging} from "firebase-admin/messaging";

/**
 * `unknown` is for a dependency that genuinely was not exercised this round.
 * It exists so a check never has to choose between claiming health it did not
 * observe and reporting an incident that is not happening.
 */
export type HealthStatus = "operational" | "degraded" | "outage" | "unknown";

export type ServiceHealth = {
  detail: string;
  id: string;
  latencyMs: number;
  name: string;
  sortOrder: number;
  status: HealthStatus;
};

/** Keeps one slow dependency from stalling the whole health refresh. */
const PROBE_TIMEOUT_MS = 6_000;

/** Secret values registered here are scrubbed from every outgoing string. */
const secretValues = new Set<string>();

export function registerSecretForRedaction(value: string | undefined | null) {
  const trimmed = (value ?? "").trim();
  if (trimmed.length >= 8) secretValues.add(trimmed);
}

/**
 * Last line of defence: even if an upstream error echoed a credential back to
 * us, it never reaches Firestore or the admin UI.
 */
export function redact(value: string) {
  let output = value;
  secretValues.forEach((secret) => {
    if (output.includes(secret)) output = output.split(secret).join("[redacted]");
  });
  return output;
}

function errorText(error: unknown) {
  const timedOut = error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError");
  if (timedOut) return `ไม่ตอบสนองภายใน ${PROBE_TIMEOUT_MS / 1000} วินาที`;
  const message = error instanceof Error ? error.message : String(error);
  return redact(message.replace(/\s+/g, " ")).slice(0, 140);
}

type Measured<T> =
  | {latencyMs: number; ok: true; value: T}
  | {error: unknown; latencyMs: number; ok: false};

async function measure<T>(run: () => Promise<T>): Promise<Measured<T>> {
  const startedAt = Date.now();
  try {
    // The await has to complete before the clock is read: object literal
    // properties evaluate top to bottom, so timing it inline would always
    // record 0 ms.
    const value = await run();
    return {latencyMs: Date.now() - startedAt, ok: true, value};
  } catch (error) {
    return {error, latencyMs: Date.now() - startedAt, ok: false};
  }
}

function fetchWithTimeout(url: string, init: RequestInit = {}) {
  return fetch(url, {...init, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)});
}

/** Shapes an HTTP status into the three states the health page renders. */
function statusFromHttp(code: number): HealthStatus {
  if (code >= 200 && code < 300) return "operational";
  if (code === 429 || code === 408 || code >= 500) return "degraded";
  return "outage";
}

/**
 * Describes an HTTP outcome without claiming success: "responded" reads as an
 * all-clear, so a non-2xx code gets neutral wording instead.
 */
function httpPhrase(subject: string, code: number) {
  return code >= 200 && code < 300 ?
    `${subject} ตอบสนอง (HTTP ${code})` :
    `${subject} ตอบกลับ HTTP ${code}`;
}

function health(base: ServiceHealth): ServiceHealth {
  return {...base, detail: redact(base.detail).slice(0, 220)};
}

/**
 * Validates a Gemini API key against the model-list endpoint. This is an
 * auth-checked read that costs no generation tokens, so it separates
 * "key rejected" from "quota exhausted" from "service unreachable".
 */
export async function probeGeminiKey(options: {
  apiKey: string;
  id: string;
  name: string;
  purpose: string;
  sortOrder: number;
}): Promise<ServiceHealth> {
  const {apiKey, id, name, purpose, sortOrder} = options;
  if (!apiKey.trim()) {
    return health({
      detail: `${purpose} · ยังไม่ได้ตั้งค่า secret ใน Cloud Functions`,
      id, latencyMs: 0, name, sortOrder, status: "degraded",
    });
  }

  const result = await measure(() => fetchWithTimeout(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
    {headers: {"x-goog-api-key": apiKey}, method: "GET"},
  ));

  if (!result.ok) {
    return health({
      detail: `${purpose} · เชื่อมต่อ Gemini ไม่ได้: ${errorText(result.error)}`,
      id, latencyMs: result.latencyMs, name, sortOrder, status: "outage",
    });
  }

  const response = result.value;
  const status = statusFromHttp(response.status);
  const suffix = response.status === 429 ?
    "โควตาเต็ม (HTTP 429)" :
    status === "operational" ?
      "คีย์ใช้งานได้ · ตรวจผ่าน models.list" :
      `Gemini ปฏิเสธคำขอ (HTTP ${response.status})`;
  return health({
    detail: `${purpose} · ${suffix}`,
    id, latencyMs: result.latencyMs, name, sortOrder, status,
  });
}

/**
 * iApp has no free authenticated read, so probing it means checking that the
 * OCR host answers and that the key is configured — deliberately *not*
 * uploading a document, which would burn paid OCR quota on every refresh.
 */
export async function probeIappOcr(
  apiKey: string,
  sortOrder: number,
): Promise<ServiceHealth> {
  const id = "iapp-ocr";
  const name = "iApp Thai OCR";
  const configured = Boolean(apiKey.trim());
  const result = await measure(() => fetchWithTimeout(
    "https://api.iapp.co.th/", {method: "GET"},
  ));

  if (!result.ok) {
    return health({
      detail: `Thai OCR fallback · เชื่อมต่อ api.iapp.co.th ไม่ได้: ${errorText(result.error)}`,
      id, latencyMs: result.latencyMs, name, sortOrder, status: "outage",
    });
  }
  if (!configured) {
    return health({
      detail: "Thai OCR fallback · โฮสต์ตอบสนอง แต่ยังไม่ได้ตั้งค่า secret",
      id, latencyMs: result.latencyMs, name, sortOrder, status: "degraded",
    });
  }
  // Any HTTP answer from the root path proves DNS, TLS, and routing are fine.
  // The code itself is not shown because it describes the marketing root, not
  // the OCR endpoint, and a 404 next to a green dot only reads as a fault.
  return health({
    detail: "Thai OCR fallback · โฮสต์ตอบสนอง · ตั้งค่าคีย์แล้ว",
    id, latencyMs: result.latencyMs, name, sortOrder, status: "operational",
  });
}

/** Resolves Vision credentials and confirms the Vision endpoint answers. */
export async function probeVision(
  getProjectId: () => Promise<string>,
  sortOrder: number,
): Promise<ServiceHealth> {
  const id = "ocr";
  const name = "Cloud Vision OCR";
  const credentials = await measure(getProjectId);
  if (!credentials.ok) {
    return health({
      detail: `อ่าน credential ของ Vision ไม่สำเร็จ: ${errorText(credentials.error)}`,
      id, latencyMs: credentials.latencyMs, name, sortOrder, status: "outage",
    });
  }

  const reachable = await measure(() => fetchWithTimeout(
    "https://vision.googleapis.com/$discovery/rest?version=v1", {method: "GET"},
  ));
  if (!reachable.ok) {
    return health({
      detail: `credential พร้อม แต่เรียก vision.googleapis.com ไม่ได้: ${errorText(reachable.error)}`,
      id, latencyMs: reachable.latencyMs, name, sortOrder, status: "outage",
    });
  }
  return health({
    detail: `credential พร้อม · ${httpPhrase("endpoint", reachable.value.status)}`,
    id,
    latencyMs: credentials.latencyMs + reachable.latencyMs,
    name,
    sortOrder,
    status: statusFromHttp(reachable.value.status),
  });
}

/**
 * Google Calendar authorisation is per-user and happens on the client, so the
 * server can only verify that the Calendar API surface itself is reachable.
 * The detail line says so rather than implying user sync was verified.
 */
export async function probeGoogleCalendar(sortOrder: number): Promise<ServiceHealth> {
  const id = "calendar";
  const name = "Google Calendar Sync";
  const result = await measure(() => fetchWithTimeout(
    "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest", {method: "GET"},
  ));
  if (!result.ok) {
    return health({
      detail: `เรียก Calendar API ไม่ได้: ${errorText(result.error)}`,
      id, latencyMs: result.latencyMs, name, sortOrder, status: "outage",
    });
  }
  return health({
    detail: `${httpPhrase("Calendar API", result.value.status)} · OAuth รายผู้ใช้ทำฝั่งแอป`,
    id, latencyMs: result.latencyMs, name, sortOrder,
    status: statusFromHttp(result.value.status),
  });
}

export type AuthProbeResult = {
  facebookUsers: number;
  googleUsers: number;
  health: ServiceHealth;
  passwordUsers: number;
  reachable: boolean;
};

/**
 * One `listUsers` call powers three entries: Firebase Auth itself plus the
 * Google and Facebook sign-in providers, which are judged by whether real
 * accounts are actually linked through them.
 */
export async function probeFirebaseAuth(sortOrder: number): Promise<AuthProbeResult> {
  const id = "firebase-auth";
  const name = "Firebase Authentication";
  const result = await measure(() => getAuth().listUsers(1000));
  if (!result.ok) {
    return {
      facebookUsers: 0,
      googleUsers: 0,
      health: health({
        detail: `เรียก Admin SDK listUsers ไม่สำเร็จ: ${errorText(result.error)}`,
        id, latencyMs: result.latencyMs, name, sortOrder, status: "outage",
      }),
      passwordUsers: 0,
      reachable: false,
    };
  }

  const users = result.value.users;
  const countProvider = (providerId: string) => users.filter(
    (user) => user.providerData.some((provider) => provider.providerId === providerId),
  ).length;

  return {
    facebookUsers: countProvider("facebook.com"),
    googleUsers: countProvider("google.com"),
    health: health({
      detail: `Admin SDK ตอบสนอง · อ่านบัญชีได้ ${users.length} รายการ`,
      id, latencyMs: result.latencyMs, name, sortOrder, status: "operational",
    }),
    passwordUsers: countProvider("password"),
    reachable: true,
  };
}

/** Reports a sign-in provider by real linked-account evidence, not config. */
export function signInProviderHealth(options: {
  authReachable: boolean;
  id: string;
  linkedUsers: number;
  name: string;
  sortOrder: number;
}): ServiceHealth {
  const {authReachable, id, linkedUsers, name, sortOrder} = options;
  if (!authReachable) {
    return health({
      detail: "ตรวจไม่ได้เพราะ Firebase Authentication ไม่ตอบสนอง",
      id, latencyMs: 0, name, sortOrder, status: "outage",
    });
  }
  return health({
    detail: linkedUsers > 0 ?
      `มีบัญชีที่ผูกผ่านผู้ให้บริการนี้ ${linkedUsers} รายการ` :
      "ยังไม่มีบัญชีใดเข้าสู่ระบบด้วยผู้ให้บริการนี้",
    id, latencyMs: 0, name, sortOrder,
    status: linkedUsers > 0 ? "operational" : "degraded",
  });
}

/** Reads real bucket metadata, so a missing or unreachable bucket surfaces. */
export async function probeFirebaseStorage(
  getMetadata: () => Promise<unknown>,
  bucketName: string,
  sortOrder: number,
): Promise<ServiceHealth> {
  const id = "firebase-storage";
  const name = "Firebase Storage";
  const result = await measure(getMetadata);
  if (!result.ok) {
    return health({
      detail: `อ่าน metadata ของบักเก็ตไม่สำเร็จ: ${errorText(result.error)}`,
      id, latencyMs: result.latencyMs, name, sortOrder, status: "outage",
    });
  }
  return health({
    detail: `บักเก็ต ${bucketName} ตอบสนอง`,
    id, latencyMs: result.latencyMs, name, sortOrder, status: "operational",
  });
}

/** Fetches the deployed web build so a broken hosting release is visible. */
export async function probeFirebaseHosting(
  projectId: string,
  sortOrder: number,
): Promise<ServiceHealth> {
  const id = "firebase-hosting";
  const name = "Firebase Hosting";
  if (!projectId) {
    return health({
      detail: "ไม่พบ project id ของ runtime จึงตรวจ Hosting ไม่ได้",
      id, latencyMs: 0, name, sortOrder, status: "degraded",
    });
  }
  const url = `https://${projectId}.web.app/`;
  const result = await measure(() => fetchWithTimeout(url, {method: "GET"}));
  if (!result.ok) {
    return health({
      detail: `เรียก ${projectId}.web.app ไม่ได้: ${errorText(result.error)}`,
      id, latencyMs: result.latencyMs, name, sortOrder, status: "outage",
    });
  }
  return health({
    detail: httpPhrase(`${projectId}.web.app`, result.value.status),
    id, latencyMs: result.latencyMs, name, sortOrder,
    status: statusFromHttp(result.value.status),
  });
}

/**
 * A dry-run send validates the FCM pipeline end to end without delivering a
 * notification to anybody.
 */
export async function probeCloudMessaging(sortOrder: number): Promise<ServiceHealth> {
  const id = "fcm";
  const name = "Firebase Cloud Messaging";
  const result = await measure(() => getMessaging().send({
    data: {probe: "health"},
    topic: "smartlife-health-probe",
  }, true));
  if (!result.ok) {
    return health({
      detail: `ส่งแบบ dry-run ไม่สำเร็จ: ${errorText(result.error)}`,
      id, latencyMs: result.latencyMs, name, sortOrder, status: "outage",
    });
  }
  return health({
    detail: "ตรวจด้วย dry-run send สำเร็จ · ไม่มีการส่งแจ้งเตือนจริง",
    id, latencyMs: result.latencyMs, name, sortOrder, status: "operational",
  });
}

/**
 * What the calling client reported about minting its own App Check token.
 *
 * This is client-supplied and therefore untrusted: it is used only to explain
 * *why* attestation failed. It can never on its own turn the check green —
 * that requires `serverVerified`, which the Functions runtime derives from the
 * token signature and cannot be forged by the caller.
 */
export type AppCheckClientReport = {
  /** False when the platform does not enforce App Check (e.g. demo mode). */
  applicable: boolean;
  ok: boolean;
  platform: string;
  reason: string;
};

/**
 * Reports Firebase App Check as a real attestation round trip.
 *
 * A server calling itself can never mint an App Check token — only a real app
 * instance passing Play Integrity / reCAPTCHA can — so probing this the way
 * the other services are probed is impossible by construction. What *is*
 * verifiable is the full path: the client mints a token with its real
 * provider, the Functions runtime verifies the signature, and this reports
 * both halves. That status genuinely moves when attestation breaks.
 *
 * When no client took part (a server-to-server or scripted invocation), the
 * result is `unknown` rather than `degraded`: nothing was observed, so
 * claiming an incident would be as dishonest as claiming health.
 */
export function appCheckHealth(options: {
  clientReport: AppCheckClientReport | null;
  serverVerified: boolean;
  sortOrder: number;
}): ServiceHealth {
  const {clientReport, serverVerified, sortOrder} = options;
  const base = {id: "app-check", latencyMs: 0, name: "Firebase App Check", sortOrder};

  if (clientReport && !clientReport.applicable) {
    return health({
      ...base,
      detail: `ไม่ได้บังคับใช้บนแพลตฟอร์ม ${clientReport.platform} จึงไม่ได้ตรวจรอบนี้`,
      status: "unknown",
    });
  }

  if (serverVerified) {
    // The signature checked out server-side, which is the only evidence that
    // can turn this green.
    return health({
      ...base,
      detail: clientReport ?
        `ไคลเอนต์ (${clientReport.platform}) ออกโทเคนได้ และเซิร์ฟเวอร์ตรวจลายเซ็นผ่าน` :
        "คำขอนี้แนบ App Check token ที่เซิร์ฟเวอร์ตรวจลายเซ็นผ่านแล้ว",
      status: "operational",
    });
  }

  if (!clientReport) {
    return health({
      ...base,
      detail: "ไม่ได้ตรวจรอบนี้ เพราะผู้เรียกไม่ใช่แอปจริงที่ออกโทเคนได้ (เช่น สคริปต์หรืองานเบื้องหลัง)",
      status: "unknown",
    });
  }

  if (!clientReport.ok) {
    return health({
      ...base,
      detail: `ไคลเอนต์ (${clientReport.platform}) ออกโทเคนไม่สำเร็จ: ${clientReport.reason}`,
      status: "outage",
    });
  }

  // The client believes it minted a token but the request reached us without a
  // verifiable one — a real misconfiguration, not a probe limitation.
  return health({
    ...base,
    detail: `ไคลเอนต์ (${clientReport.platform}) แจ้งว่าออกโทเคนได้ แต่คำขอมาถึงโดยไม่มีโทเคนที่ตรวจผ่าน`,
    status: "degraded",
  });
}
