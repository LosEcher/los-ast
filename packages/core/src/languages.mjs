import rust from '@ast-grep/lang-rust'
import { Lang, registerDynamicLanguage } from '@ast-grep/napi'

let registered = false

export function registerLanguages() {
  if (registered) return
  registerDynamicLanguage({ rust })
  registered = true
}

export function languageFromFilePath(filePath) {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.ts')) return Lang.TypeScript
  if (lower.endsWith('.tsx')) return Lang.Tsx
  if (lower.endsWith('.js')) return Lang.JavaScript
  if (lower.endsWith('.jsx')) return Lang.JavaScript
  if (lower.endsWith('.mjs')) return Lang.JavaScript
  if (lower.endsWith('.cjs')) return Lang.JavaScript
  if (lower.endsWith('.css')) return Lang.Css
  if (lower.endsWith('.html')) return Lang.Html
  if (lower.endsWith('.rs')) return 'rust'
  return null
}

