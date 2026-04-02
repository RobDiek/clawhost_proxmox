import type en from '#i18n/langs/en'

type DeepString<T> = {
    [K in keyof T]: T[K] extends string ? string : DeepString<T[K]>
}

export type Translations = DeepString<typeof en>

type NestedKeyOf<T> = T extends object
    ? {
          [K in keyof T & string]: T[K] extends object
              ? `${K}` | `${K}.${NestedKeyOf<T[K]>}`
              : `${K}`
      }[keyof T & string]
    : never

export type TranslationKey = NestedKeyOf<Translations>

export type Languages =
    | 'en'
    | 'fr'
    | 'es'
    | 'de'
    | 'zh'
    | 'hi'
    | 'ar'
    | 'ru'
    | 'ja'
    | 'tr'
    | 'it'
    | 'pl'
    | 'nl'
    | 'pt'

export interface I18nState {
    languages: Record<Languages, Translations>
    currentLanguage: Languages
}