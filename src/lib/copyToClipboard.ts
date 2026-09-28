export function copyWithExecCommand(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.width = '1px'
    ta.style.height = '1px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

const CLIPBOARD_API_TIMEOUT_MS = 400

/** Copie dans le presse-papiers sans attendre d’autre I/O avant l’écriture (préserve le geste utilisateur). */
export function copyToClipboard(text: string): Promise<boolean> {
  const canUseClipboardApi =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard?.writeText

  if (!canUseClipboardApi) {
    return Promise.resolve(copyWithExecCommand(text))
  }

  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }

    const timer = window.setTimeout(() => {
      finish(copyWithExecCommand(text))
    }, CLIPBOARD_API_TIMEOUT_MS)

    void navigator.clipboard.writeText(text).then(
      () => {
        window.clearTimeout(timer)
        finish(true)
      },
      () => {
        window.clearTimeout(timer)
        finish(copyWithExecCommand(text))
      },
    )
  })
}
