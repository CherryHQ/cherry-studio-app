import { useEffect, useRef, useState } from 'react'

const DEFAULT_MIN_DURATION = 300

export function useSkeletonLoading(isLoading: boolean, minDuration = DEFAULT_MIN_DURATION) {
  const [showSkeleton, setShowSkeleton] = useState(true)
  const loadingStartTime = useRef(Date.now())

  useEffect(() => {
    if (isLoading) {
      loadingStartTime.current = Date.now()
      setShowSkeleton(true)
      return
    }

    const elapsed = Date.now() - loadingStartTime.current
    const remaining = minDuration - elapsed

    if (remaining <= 0) {
      setShowSkeleton(false)
      return
    }

    const timer = setTimeout(() => setShowSkeleton(false), remaining)
    return () => clearTimeout(timer)
  }, [isLoading, minDuration])

  return showSkeleton
}
