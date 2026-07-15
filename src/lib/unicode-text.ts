export function decodeUnicodeEscapes(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
    String.fromCharCode(Number.parseInt(code, 16)),
  );
}
