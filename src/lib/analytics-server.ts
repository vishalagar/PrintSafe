export async function trackServerEvent(event: string, props?: Record<string, string>): Promise<void> {
  try {
    await fetch('https://us.i.posthog.com/capture/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: 'phc_EvnMxzMEttecwpr1UoQlWYM2uM27KK39Yp7TzWYP1Y8',
        event,
        distinct_id: 'server',
        properties: props ?? {},
      }),
    })
  } catch { /* never block server ops */ }
}
