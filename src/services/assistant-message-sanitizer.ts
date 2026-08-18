import type {AssistantChatMessage} from '@/types/assistant';

const staleOperationalReplyPatterns = [
  /(?:app-debug\.apk|start-smartlife-mumu\.cmd)/i,
  /(?:ปุ่มไมค์|ระบบไมค์|เสียงตอบกลับ|แอปที่เปิดอยู่)[\s\S]{0,220}(?:Development Build|rebuild|บิลด์ใหม่|โมดูลเสียง|ระบบรับเสียง|บริการรู้จำเสียง|Speech Recognition)/i,
  /^ระบบยืนยันตัวตนกับบริการ AI ไม่สำเร็จชั่วคราวครับ/,
  /^อัปโหลดหรือวิเคราะห์ไฟล์ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ต/,
];

function normalizedMessageContent(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function sanitizeAssistantMessages(messages: AssistantChatMessage[]) {
  return messages.reduce<AssistantChatMessage[]>((result, message) => {
    if (message.role === 'assistant' && staleOperationalReplyPatterns.some((pattern) => pattern.test(message.content))) {
      return result;
    }

    const previous = result[result.length - 1];
    if (
      previous
      && previous.role === 'assistant'
      && message.role === 'assistant'
      && normalizedMessageContent(previous.content) === normalizedMessageContent(message.content)
    ) {
      return result;
    }

    result.push(message);
    return result;
  }, []);
}
