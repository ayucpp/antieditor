"use client"

import type React from "react"

import { useCallback } from "react"
import { Upload, Video } from "lucide-react"

interface VideoUploadZoneProps {
  onFilesSelected: (files: File[]) => void
  hasFiles: boolean
}

export function VideoUploadZone({ onFilesSelected, hasFiles }: VideoUploadZoneProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("video/") || f.type.startsWith("audio/"))
      if (files.length > 0) {
        onFilesSelected(files)
      }
    },
    [onFilesSelected],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : []
      if (files.length > 0) {
        onFilesSelected(files)
      }
    },
    [onFilesSelected],
  )

  return (
    <div className="p-6">
      <label onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} className="block relative cursor-pointer group">
        <input type="file" accept="video/*,audio/*" multiple onChange={handleFileInput} className="sr-only" />

        <div
          className={`
          relative rounded-lg border-2 border-dashed transition-all duration-200
          ${hasFiles
              ? "border-indigo-500/40 bg-indigo-500/5"
              : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
            }
          p-8 flex flex-col items-center justify-center gap-3 min-h-[140px]
        `}
        >
          {hasFiles ? (
            <>
              <Video className="w-8 h-8 text-indigo-400" />
              <div className="text-center">
                <p className="text-sm text-white/90 font-medium">Media loaded</p>
                <p className="text-xs text-white/50 mt-1">Click to add more</p>
              </div>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-white/30 group-hover:text-white/50 transition-colors" />
              <div className="text-center">
                <p className="text-sm text-white/70 font-medium">Upload footage</p>
                <p className="text-xs text-white/40 mt-1">Drag & drop multiple clips</p>
              </div>
            </>
          )}
        </div>
      </label>
    </div>
  )
}
