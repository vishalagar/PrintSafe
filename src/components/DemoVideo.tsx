"use client";

import { useRef, useState, useCallback } from "react";
import { capture } from "@/lib/analytics";

const VIDEO_SRC = "/demo/how-it-works.mp4";
const POSTER_SRC = "/demo/how-it-works-poster.jpg";

/**
 * Narrated 52s explainer of the encryption architecture. The clip has a
 * voiceover, so it never autoplays — the poster stays up until the visitor
 * asks for it, which also keeps the 2.6 MB payload off first paint
 * (`preload="none"`).
 */
export default function DemoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasStarted, setHasStarted] = useState(false);

  const handlePlayClick = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    // Reveal controls first: if play() is rejected (autoplay policy, a codec
    // the browser refuses, a stalled network) the visitor still has native
    // controls to retry with instead of a dead poster.
    setHasStarted(true);
    try {
      await video.play();
      capture("DemoVideoPlayed");
    } catch {
      capture("DemoVideoPlayFailed");
    }
  }, []);

  return (
    <div className="wrap" style={{ paddingBottom: 80 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            letterSpacing: "2.5px",
            textTransform: "uppercase",
            fontWeight: 700,
            background: "var(--yellow)",
            border: "2px solid var(--ink)",
            padding: "6px 16px",
            borderRadius: 100,
            boxShadow: "var(--shadow-xs)",
            display: "inline-block",
            marginBottom: 18,
          }}
        >
          52-Second Explainer
        </span>
        <h2
          style={{
            fontFamily: "'Fraunces', serif",
            fontWeight: 900,
            fontSize: "clamp(26px, 4vw, 38px)",
            lineHeight: 1.15,
            letterSpacing: "-0.6px",
            color: "#FFFFFF",
            textShadow: "2px 3px 0 var(--stamp)",
            marginBottom: 12,
          }}
        >
          &ldquo;Can your developers see my documents?&rdquo;
        </h2>
        <p
          style={{
            fontSize: 15.5,
            color: "#FFFFFF",
            maxWidth: 520,
            margin: "0 auto",
            lineHeight: 1.7,
            fontWeight: 500,
          }}
        >
          No — and here is the architecture that makes it true. Watch how your
          file is encrypted, shared, and shredded.
        </p>
      </div>

      <div
        style={{
          position: "relative",
          background: "var(--surface)",
          border: "2px solid var(--ink)",
          borderRadius: 16,
          padding: 12,
          boxShadow: "var(--shadow)",
        }}
      >
        <div
          style={{
            position: "relative",
            aspectRatio: "16 / 9",
            borderRadius: 10,
            overflow: "hidden",
            border: "2px solid var(--ink)",
            background: "var(--ink)",
          }}
        >
          <video
            ref={videoRef}
            src={VIDEO_SRC}
            poster={POSTER_SRC}
            preload="none"
            playsInline
            controls={hasStarted}
            onEnded={() => capture("DemoVideoCompleted")}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              objectFit: "cover",
            }}
          />

          {!hasStarted && (
            <button
              onClick={handlePlayClick}
              aria-label="Play the PrintSafe explainer video"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0, 0, 0, 0.32)",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: "50%",
                  background: "var(--yellow)",
                  border: "3px solid var(--ink)",
                  boxShadow: "var(--shadow)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26,
                  color: "var(--ink)",
                  paddingLeft: 6,
                  lineHeight: 1,
                }}
              >
                ▶
              </span>
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          marginTop: 16,
          fontSize: 12,
          color: "var(--text-dim)",
          flexWrap: "wrap",
        }}
      >
        <span>🔑 Key never leaves your browser</span>
        <span style={{ opacity: 0.3 }}>·</span>
        <span>🗄️ Ciphertext under an opaque UUID</span>
        <span style={{ opacity: 0.3 }}>·</span>
        <span>🚫 No key column to leak</span>
      </div>
    </div>
  );
}
