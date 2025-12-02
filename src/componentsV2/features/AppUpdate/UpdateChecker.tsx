import React, { useEffect } from 'react'

import { useAppUpdate } from '@/hooks/useAppUpdate'

// Update checker component - checks for updates on mount
export function UpdateChecker({ children }: { children: React.ReactNode }) {
  const { checkUpdate } = useAppUpdate()

  useEffect(() => {
    // Delay update check to ensure UI is fully rendered
    const timer = setTimeout(() => {
      checkUpdate()
    }, 1500)

    return () => clearTimeout(timer)
  }, [checkUpdate])

  return <>{children}</>
}
