type UnknownRecord = Record<string, unknown>;

export type IappDocumentExtraction = {
  characterCount: number;
  pageCount: number;
  pages: string[];
  rawResponse: UnknownRecord;
  text: string;
};

export class IappDocumentOcrError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null = null,
  ) {
    super(message);
    this.name = "IappDocumentOcrError";
  }
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ?
    value as UnknownRecord :
    {};
}

function cleanPage(value: unknown) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
}

function responseMessage(status: number) {
  if (status === 400) return "ไฟล์เอกสารไม่ถูกต้องหรือ iApp ไม่รองรับรูปแบบนี้";
  if (status === 401 || status === 403) {
    return "ไม่สามารถยืนยันสิทธิ์ iApp ได้ กรุณาตรวจสอบ IAPP_API_KEY";
  }
  if (status === 413) return "ไฟล์เอกสารมีขนาดใหญ่เกินกว่าที่ iApp รองรับ";
  if (status === 429) return "โควตา iApp ถูกใช้งานครบแล้ว กรุณาลองใหม่ภายหลัง";
  if (status >= 500) return "ระบบอ่านเอกสาร iApp ขัดข้องชั่วคราว";
  return "ไม่สามารถอ่านเอกสารด้วย iApp ได้";
}

export function normalizeIappDocumentResponse(value: unknown): IappDocumentExtraction {
  const rawResponse = record(value);
  const rawPages = Array.isArray(rawResponse.text) ? rawResponse.text : [rawResponse.text];
  const pages = rawPages.map(cleanPage).filter(Boolean);
  const text = pages.join("\n\n").trim();
  if (!text) {
    const message = typeof rawResponse.message === "string" ? rawResponse.message.trim() : "";
    throw new IappDocumentOcrError(
      message || "iApp ไม่พบข้อความที่อ่านได้ในเอกสาร",
    );
  }

  const iapp = record(rawResponse.iapp);
  const reportedPages = Number(iapp.pages ?? iapp.page);
  const pageCount = Number.isFinite(reportedPages) && reportedPages > 0 ?
    Math.round(reportedPages) :
    pages.length;

  return {
    characterCount: text.length,
    pageCount,
    pages,
    rawResponse,
    text,
  };
}

export async function extractDocumentWithIapp({
  apiKey,
  bytes,
  contentType,
  fileName,
}: {
  apiKey: string;
  bytes: Buffer;
  contentType: string;
  fileName: string;
}) {
  if (!apiKey.trim()) {
    throw new IappDocumentOcrError("ยังไม่ได้ตั้งค่า IAPP_API_KEY");
  }
  if (!bytes.length || bytes.length > 30 * 1024 * 1024) {
    throw new IappDocumentOcrError("ไฟล์เอกสารต้องมีขนาดไม่เกิน 30 MB", 400);
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], {type: contentType || "application/octet-stream"}),
    fileName,
  );

  let response: Response;
  try {
    response = await fetch(
      "https://api.iapp.co.th/v3/store/ocr/document/ocr",
      {
        body: form,
        headers: {apikey: apiKey},
        method: "POST",
        signal: AbortSignal.timeout(55_000),
      },
    );
  } catch (error) {
    const timedOut = error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new IappDocumentOcrError(
      timedOut ?
        "iApp ใช้เวลาประมวลผลเอกสารนานเกินไป" :
        "ไม่สามารถเชื่อมต่อระบบอ่านเอกสาร iApp ได้",
    );
  }

  if (!response.ok) {
    throw new IappDocumentOcrError(
      responseMessage(response.status),
      response.status,
    );
  }
  const body = await response.json().catch(() => null);
  return normalizeIappDocumentResponse(body);
}
