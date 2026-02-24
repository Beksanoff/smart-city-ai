import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { ru } from './locales/ru'
import { en } from './locales/en'
import { kk } from './locales/kk'

const resources = {
  ru: { translation: ru },
  en: { translation: en },
  kk: { translation: kk },
}

const savedLang = typeof localStorage !== 'undefined' ? localStorage.getItem('smartcity_lang') : null
const initialLang = (savedLang && (savedLang === 'ru' || savedLang === 'en' || savedLang === 'kk')) ? savedLang : 'ru'

i18n.use(initReactI18next).init({
  resources,
  lng: initialLang,
  fallbackLng: 'ru',
  interpolation: {
    escapeValue: false,
  },
})

if (typeof document !== 'undefined' && document.documentElement) {
  document.documentElement.lang = initialLang
}

export default i18n
