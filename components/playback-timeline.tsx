"use client"

import type React from "react"

import { useRef, useState } from "react"
import { Play, Pause } from "lucide-react"

interface PlaybackTimelineProps {
  currentTime: number
  duration: number
  onSeek: (time: number) => void
  isPlaying: boolean
  onTogglePlay: () => void
}

export function PlaybackTimeline({ currentTime, duration, onSeek, isPlaying, onTogglePlay }: PlaybackTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !duration) return

    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    const time = percentage * duration
    onSeek(Math.max(0, Math.min(time, duration)))
  }

  const handleMouseDown = () => setIsDragging(true)
  const handleMouseUp = () => setIsDragging(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !timelineRef.current || !duration) return
    handleTimelineClick(e)
  }

  const progress = duration ? (currentTime / duration) * 100 : 0

  // Mock semantic overlays
  const silentSegments = [{ start: 15, end: 22, label: "Silent" }]
  const speechSegments = [
    { start: 0, end: 15, label: "Speech" },
    { start: 22, end: 45, label: "Speech" },
  ]

  return (
    <div className="space-y-3">
      {/* Timeline Container */}
      <div className="relative">
        {/* Semantic Overlays (Visual Only) */}
        <div className="absolute -top-1 left-0 right-0 h-1 flex">
          {duration > 0 && (
            <>
              {/* Speech segments */}
              {speechSegments.map((segment, i) => (
                <div
                  key={`speech-${i}`}
                  className="absolute h-full bg-green-500/30 rounded-full"
                  style={{
                    left: `${(segment.start / duration) * 100}%`,
                    width: `${((segment.end - segment.start) / duration) * 100}%`,
                  }}
                />
              ))}
              {/* Silent segments */}
              {silentSegments.map((segment, i) => (
                <div
                  key={`silent-${i}`}
                  className="absolute h-full bg-orange-500/30 rounded-full"
                  style={{
                    left: `${(segment.start / duration) * 100}%`,
                    width: `${((segment.end - segment.start) / duration) * 100}%`,
                  }}
                />
              ))}
            </>
          )}
        </div>

        {/* Timeline Track */}
        <div
          ref={timelineRef}
          onClick={handleTimelineClick}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseUp}
          className="relative h-2 bg-white/10 rounded-full cursor-pointer group mt-2"
        >
          {/* Progress Bar */}
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />

          {/* Playhead */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${progress}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onTogglePlay}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
          </button>
          <span className="font-mono text-white/70 text-xs">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Semantic Legend */}
        <div className="flex items-center gap-3 text-xs text-white/50">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-1 bg-green-500/50 rounded-full" />
            <span>Speech</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-1 bg-orange-500/50 rounded-full" />
            <span>Silent</span>
          </div>
        </div>
      </div>
    </div>
  )
}
