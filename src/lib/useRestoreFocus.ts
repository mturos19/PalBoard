import { useEffect, useRef } from 'react'

/**
 * Returns focus to whatever had it before an overlay opened.
 *
 * Both overlays here are opened from a control — a table row, the search button
 * — and both unmount on close. Without this the focused element disappears with
 * them and focus falls back to `<body>`, which strands keyboard users at the top
 * of the document and silently kills the Esc/Ctrl+K shortcuts until they click
 * something.
 */
export function useRestoreFocus(open: boolean): void {
  const previous = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      // The trigger may have been unmounted meanwhile (a re-parsed save can
      // replace the row that opened the drawer); focusing a detached node is a
      // no-op, so guard on it still being in the document.
      const target = previous.current
      previous.current = null
      if (target && target.isConnected) target.focus()
    }
  }, [open])
}
