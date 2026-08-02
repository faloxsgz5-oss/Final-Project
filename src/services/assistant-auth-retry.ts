import {classifyAssistantError} from './assistant-error.ts';

export async function withAssistantAuthRetry<T>(
  operation: () => Promise<T>,
  options: {
    expectedUid: string;
    getCurrentUid: () => string | undefined;
    refreshToken: () => Promise<unknown>;
  },
) {
  try {
    return await operation();
  } catch (error) {
    if (
      classifyAssistantError(error) !== 'authentication' ||
      options.getCurrentUid() !== options.expectedUid
    ) throw error;
    await options.refreshToken();
    return operation();
  }
}
