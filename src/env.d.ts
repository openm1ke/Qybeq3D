interface ImportMetaEnv {
  /** `yandex` or `vk` for platform builds; unset means the open web. */
  readonly VITE_PLATFORM?: 'web' | 'yandex' | 'vk'
  readonly VITE_VK_APP_ID?: string
}
