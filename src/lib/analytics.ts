'use client'
import posthog from 'posthog-js'

export type FileType = 'pdf' | 'jpg' | 'png' | 'heic' | 'unknown'
export type FileSizeBucket = 'small' | 'medium' | 'large'
export type TtlLabel = 'view-once' | '15min' | '30min' | '1hr'

export function mimeToFileType(mime: string): FileType {
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic'
  return 'unknown'
}

export function sizeToFileSizeBucket(bytes: number): FileSizeBucket {
  if (bytes < 1_000_000) return 'small'
  if (bytes < 10_000_000) return 'medium'
  return 'large'
}

export function ttlToLabel(ttl: number): TtlLabel {
  if (ttl === 0) return 'view-once'
  if (ttl === 900) return '15min'
  if (ttl === 1800) return '30min'
  return '1hr'
}

export function capture(event: string, props?: Record<string, string>) {
  try { posthog.capture(event, props) } catch {}
}
