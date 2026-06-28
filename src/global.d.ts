declare module "*.css";

declare module "virtual:pwa-register/react" {
  import type { Dispatch, SetStateAction } from "react";
  export function useRegisterSW(options?: {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: any) => void;
  }): {
    needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
    offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}

interface ImportMetaEnv {
  readonly VITE_GAS_URL: string;
  readonly GEMINI_API_KEY: string;
  readonly VITE_MQTT_URL: string;
  readonly VITE_MQTT_URL_BACKUP: string;
  readonly VITE_MQTT_USER: string;
  readonly VITE_MQTT_PASS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
