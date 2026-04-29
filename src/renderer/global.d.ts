import type { RendererApi } from "../shared/types";

declare global {
  interface Window {
    balkonAgent: RendererApi;
  }
}

export {};
