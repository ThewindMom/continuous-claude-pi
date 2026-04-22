declare module "@mariozechner/pi-coding-agent" {
  export type ExtensionAPI = any;
  export const SessionManager: any;
  export const convertToLlm: any;
  export const serializeConversation: any;
  export function getAgentDir(): string;
}

declare module "@mariozechner/pi-ai" {
  export type Message = any;
  export const complete: any;
}
