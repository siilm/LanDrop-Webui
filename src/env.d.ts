/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  /** 开发环境下暴露的内联 Ed25519 实现 */
  __ed25519?: {
    sign: (privateKey: Uint8Array, message: Uint8Array) => Promise<Uint8Array>
    generateKeyPair: () => Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }>
  }
}
