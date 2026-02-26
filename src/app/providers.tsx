'use client'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init('phc_EvnMxzMEttecwpr1UoQlWYM2uM27KK39Yp7TzWYP1Y8', {
      api_host: 'https://us.i.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
      person_profiles: 'never',
    })
  }, [])
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
