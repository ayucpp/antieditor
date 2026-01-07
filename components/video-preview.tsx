"use client"

import { useRef, useState, useEffect } from "react"
import { PlaybackTimeline } from "@/components/playback-timeline"
import { Loader2 } from "lucide-react"

interface VideoPreviewProps {
  videoUrl: string | null
  isProcessing: boolean
  showBefore: boolean
  progress: number
}

export function VideoPreview({ videoUrl, isProcessing, showBefore, progress }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => setCurrentTime(video.currentTime)
    const handleLoadedMetadata = () => {
      setDuration(video.duration)
      console.log("Metadata loaded:", video.duration)
    }
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleError = (e: any) => console.error("Video Error:", e)

    video.addEventListener("timeupdate", handleTimeUpdate)
    video.addEventListener("loadedmetadata", handleLoadedMetadata)
    video.addEventListener("play", handlePlay)
    video.addEventListener("pause", handlePause)
    video.addEventListener("error", handleError)

    // Reset state on new url
    setCurrentTime(0)
    setIsPlaying(false)

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate)
      video.removeEventListener("loadedmetadata", handleLoadedMetadata)
      video.removeEventListener("play", handlePlay)
      video.removeEventListener("pause", handlePause)
      video.removeEventListener("error", handleError)
    }
  }, [videoUrl]) // Depend on videoUrl to re-bind/reset

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time
    }
  }

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
    }
  }

  if (!videoUrl) {
    return (
      <div className="w-full max-w-5xl aspect-video rounded-xl border border-white/5 bg-[#12121a] flex items-center justify-center">
        <div className="text-center text-white/30">
          <p className="text-sm">No video loaded</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-5xl space-y-4">
      {/* Video Player */}
      <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 bg-black shadow-2xl">
        <video ref={videoRef} src={videoUrl} className="w-full h-full object-contain" onClick={togglePlayPause} />

        {/* Processing Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center space-y-4">
              <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mx-auto" />
              <div className="space-y-2">
                <p className="text-sm text-white/90 font-medium">Processing video...</p>
                <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-white/50">{progress}%</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Read-Only Playback Timeline */}
      <PlaybackTimeline
        currentTime={currentTime}
        duration={duration}
        onSeek={handleSeek}
        isPlaying={isPlaying}
        onTogglePlay={togglePlayPause}
      />
    </div>
  )
}
