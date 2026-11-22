// Drag to reorder (by the ☰ handle) and swipe a row sideways. Both move the DOM directly while
// the finger is down (no re-render per frame), then report one change at the end.

/** Rows are the container's children with [data-drag]. Call from the handle's pointerdown. */
export function startDrag(e: PointerEvent, container: HTMLElement, from: number, onDrop: (from: number, to: number) => void) {
  const rows = [...container.querySelectorAll<HTMLElement>('[data-drag]')]
  const row = rows[from]
  if (!row) return
  e.preventDefault()
  const handle = e.currentTarget as HTMLElement
  handle.setPointerCapture(e.pointerId)
  const rects = rows.map((r) => r.getBoundingClientRect())
  const h = rects[from].height
  const scroller = container.closest('.main') as HTMLElement | null
  const startY = e.clientY
  const startScroll = scroller?.scrollTop ?? 0
  let to = from
  let lastY = e.clientY
  row.classList.add('dragging')
  rows.forEach((r, i) => { if (i !== from) r.classList.add('shifting') })
  navigator.vibrate?.(8)

  const place = () => {
    const dy = lastY - startY + ((scroller?.scrollTop ?? 0) - startScroll)
    row.style.transform = `translateY(${dy}px)`
    const mid = rects[from].top + h / 2 + dy
    to = from
    for (let i = 0; i < rects.length; i++) {
      if (i === from) continue
      const m = rects[i].top + rects[i].height / 2
      if (i < from && mid < m) { to = Math.min(to, i) }
      if (i > from && mid > m) { to = Math.max(to, i) }
    }
    rows.forEach((r, i) => {
      if (i === from) return
      const shift = from < to && i > from && i <= to ? -h : from > to && i < from && i >= to ? h : 0
      r.style.transform = shift ? `translateY(${shift}px)` : ''
    })
  }
  let raf = 0
  const auto = () => {
    if (!scroller) return
    const b = scroller.getBoundingClientRect()
    const edge = lastY < b.top + 70 ? -10 : lastY > b.bottom - 70 ? 10 : 0
    if (edge) { scroller.scrollTop += edge; place() }
    raf = requestAnimationFrame(auto)
  }
  raf = requestAnimationFrame(auto)
  const move = (ev: PointerEvent) => { lastY = ev.clientY; place() }
  const end = () => {
    cancelAnimationFrame(raf)
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', end)
    handle.removeEventListener('pointercancel', end)
    rows.forEach((r) => { r.style.transform = ''; r.classList.remove('shifting', 'dragging') })
    if (to !== from) onDrop(from, to)
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', end)
  handle.addEventListener('pointercancel', end)
}

/** Sideways swipe on a row: left past the threshold calls onLeft, right calls onRight. */
export function swipeable(onLeft?: () => void, onRight?: () => void) {
  let x0 = 0, y0 = 0, dx = 0, active = false, decided = false, el: HTMLElement | null = null, under: HTMLElement | null = null
  const reset = () => { if (el) { el.style.transition = 'transform 140ms ease-out'; el.style.transform = '' } under?.remove(); under = null }
  return {
    onPointerDown(e: PointerEvent) {
      if ((e.target as HTMLElement).closest('.handle')) return
      el = e.currentTarget as HTMLElement
      x0 = e.clientX; y0 = e.clientY; dx = 0; active = true; decided = false
    },
    onPointerMove(e: PointerEvent) {
      if (!active || !el) return
      const ddx = e.clientX - x0, ddy = e.clientY - y0
      if (!decided) {
        if (Math.abs(ddx) < 12 && Math.abs(ddy) < 12) return
        decided = true
        if (Math.abs(ddy) > Math.abs(ddx) || (ddx < 0 && !onLeft) || (ddx > 0 && !onRight)) { active = false; return }
        el.setPointerCapture(e.pointerId)
        el.style.transition = 'none'
      }
      dx = ddx
      if (!under) {
        under = document.createElement('div')
        el.parentElement?.insertBefore(under, el)
      }
      under.className = 'swipe-under' + (dx > 0 ? ' pick' : '')
      under.textContent = dx > 0 ? (el.dataset.right ?? '') : (el.dataset.left ?? '')
      under.style.top = el.offsetTop + 'px'
      under.style.height = el.offsetHeight + 'px'
      under.style.bottom = 'auto'
      el.style.transform = `translateX(${dx}px)`
    },
    onPointerUp() {
      if (!active) return
      active = false
      const go = dx < -90 ? onLeft : dx > 90 ? onRight : undefined
      if (decided && Math.abs(dx) > 12) {
        // Swallow the click that follows a swipe.
        el?.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault() }, { capture: true, once: true })
      }
      reset()
      go?.()
    },
    onPointerCancel() { active = false; reset() },
  }
}
