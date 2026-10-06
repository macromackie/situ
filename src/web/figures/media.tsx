import React, { useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import type { Figure } from "../../protocol/publication/index.js";
import { usePublication } from "../publication/context.js";
export function Replay({
  figure,
}: {
  figure: Extract<Figure, { kind: "replay" }>;
}) {
  const { view } = usePublication();
  const left = useRef<HTMLVideoElement>(null),
    right = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false),
    [error, setError] = useState(false),
    [position, setPosition] = useState(0);
  const duration = Math.min(
    figure.left.end - figure.left.start,
    figure.right.end - figure.right.start,
  );
  const seek = (seconds: number) => {
    if (left.current) left.current.currentTime = figure.left.start + seconds;
    if (right.current) right.current.currentTime = figure.right.start + seconds;
    setPosition(seconds);
  };
  const pause = () => {
    left.current?.pause();
    right.current?.pause();
    setPlaying(false);
  };
  const play = async () => {
    try {
      if (position >= duration) seek(0);
      await Promise.all([left.current?.play(), right.current?.play()]);
      setPlaying(true);
    } catch {
      pause();
      setError(true);
    }
  };
  return (
    <div className="paired-replay">
      <div className="replay-pair">
        {([figure.left, figure.right] as const).map((clip, index) => {
          const asset = view.assets[clip.assetId];
          return (
            <div key={index}>
              <div className="replay-label">
                {asset?.replay?.policy ?? asset?.title ?? "Unavailable replay"}
                <small>
                  {asset?.replay?.scenario} · seed {asset?.replay?.seed}
                </small>
              </div>
              <video
                ref={index === 0 ? left : right}
                src={`/v1/assets/${clip.assetId}`}
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={(event) => {
                  event.currentTarget.currentTime = clip.start;
                }}
                onError={() => {
                  pause();
                  setError(true);
                }}
                onTimeUpdate={
                  index === 0
                    ? (event) => {
                        const t = event.currentTarget.currentTime - clip.start;
                        if (t >= duration) {
                          pause();
                          seek(duration);
                          return;
                        }
                        setPosition(Math.max(0, t));
                        if (
                          right.current &&
                          Math.abs(
                            right.current.currentTime - figure.right.start - t,
                          ) > 0.2
                        )
                          right.current.currentTime = figure.right.start + t;
                      }
                    : undefined
                }
                aria-label={
                  index === 0 ? "Baseline replay" : "Candidate replay"
                }
              />
            </div>
          );
        })}
      </div>
      <div className="replay-controls">
        <button
          className="control"
          onClick={() => (playing ? pause() : void play())}
          disabled={error}
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
          {playing ? "Pause" : "Play both"}
        </button>
        <button
          className="icon-button"
          aria-label="Restart replays"
          onClick={() => {
            pause();
            seek(0);
          }}
        >
          <RotateCcw size={14} />
        </button>
        <input
          aria-label="Replay position"
          type="range"
          min="0"
          max={duration}
          step="0.05"
          value={position}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span>
          {position.toFixed(1)} / {duration.toFixed(1)}s
        </span>
      </div>
      {error && (
        <p role="status" className="notice">
          Media unavailable. The saved explanation and evidence references
          remain readable.
        </p>
      )}
      <p className="figure-note">
        {figure.alignment === "matched"
          ? "Matched scenario, seed and environment. Clips play from their selected starts."
          : "Illustrative comparison; conditions differ."}
      </p>
    </div>
  );
}
export function Example({
  figure,
}: {
  figure: Extract<Figure, { kind: "example" }>;
}) {
  const [error, setError] = useState(false);
  return (
    <div className="example-image">
      {error ? (
        <p className="notice">
          Image unavailable. Inspect the source reference.
        </p>
      ) : (
        <img
          src={`/v1/assets/${figure.assetId}`}
          alt={figure.title}
          onError={() => setError(true)}
        />
      )}
      <ol>
        {figure.annotations.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ol>
    </div>
  );
}
