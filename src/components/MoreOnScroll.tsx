import { useEffect, useRef } from 'preact/hooks'

/** Placed after a partial list: asks for more items as it nears the screen */
export function MoreOnScroll({ onMore }: { onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => e.isIntersecting && onMore(), { rootMargin: '800px' })
    observer.observe(ref.current!)
    return () => observer.disconnect()
  }, [onMore])
  return <div ref={ref} class="more" aria-hidden="true" />
}
