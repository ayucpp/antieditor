"use client"

import { useState, useEffect } from "react"
import { VideoUploadZone } from "@/components/video-upload-zone"
import { PromptPanel } from "@/components/prompt-panel"
import { VideoPreview } from "@/components/video-preview"
import { SystemIntelligence } from "@/components/system-intelligence"

export default function VideoEditorPage() {
  // Frontend State
  const [videoFile, setVideoFile] = useState<File | null>(null)

  // Real Backend State
  const [jobId, setJobId] = useState<string | null>(null)

  // History Management
  interface HistoryItem {
    url: string
    prompt: string
    timestamp: number
    jobId?: string
  }
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  // Restore JobID when history index changes
  const activeHistoryItem = historyIndex >= 0 && history[historyIndex] ? history[historyIndex] : null
  const videoUrl = activeHistoryItem ? activeHistoryItem.url : null

  // Sync JobId
  useEffect(() => {
    if (activeHistoryItem && activeHistoryItem.jobId && activeHistoryItem.jobId !== jobId) {
      console.log("Syncing JobID from History:", activeHistoryItem.jobId)
      setJobId(activeHistoryItem.jobId)
    }
  }, [historyIndex, history, jobId])

  const [prompt, setPrompt] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [showBefore, setShowBefore] = useState(true)
  const [interpretation, setInterpretation] = useState<string | null>(null)
  const [ffmpegCommand, setFfmpegCommand] = useState<string | null>(null)
  const [executionLogs, setExecutionLogs] = useState<string[]>([])
  const [progress, setProgress] = useState(0)

  const API_BASE = "http://localhost:3002"

  const handleVideoUpload = async (file: File) => {
    setVideoFile(file)
    const url = URL.createObjectURL(file)

    // Reset History
    setHistory([{ url, prompt: "Original", timestamp: Date.now() }])
    setHistoryIndex(0)

    // Upload to Backend (Legacy)
    const formData = new FormData()
    formData.append('video', file) // Field name 'video'

    try {
      setExecutionLogs(prev => [...prev, "• Uploading video to backend..."])
      const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()

      // Legacy returns { jobId, metadata }
      setJobId(data.jobId)

      // Update Original History with JobID
      setHistory(prev => {
        const newH = [...prev]
        if (newH[0]) newH[0].jobId = data.jobId
        return newH
      })

      setExecutionLogs(prev => [...prev, `• Video uploaded (Job ID: ${data.jobId})`, `• ${data.metadata?.duration}s`])
    } catch (err) {
      console.error(err)
      setExecutionLogs(prev => [...prev, "❌ Upload failed"])
    }
  }

  const handlePromptExecute = async (promptText: string) => {
    if (!jobId) {
      setExecutionLogs(prev => [...prev, "❌ No video job ID found. Please re-upload."])
      return
    }

    setPrompt(promptText)
    setIsProcessing(true)
    setProgress(0)
    setExecutionLogs([])

    try {
      // 1. Parse Prompt (Legacy)
      setExecutionLogs(prev => [...prev, "• Sending prompt to LLM..."])
      const parseRes = await fetch(`${API_BASE}/parse-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText, jobId: jobId })
      })
      if (!parseRes.ok) throw new Error('Prompt parsing failed')
      const intent = await parseRes.json()
      setInterpretation(JSON.stringify(intent, null, 2))
      setExecutionLogs(prev => [...prev, "• Intent parsed successfully"])
      setProgress(20)

      // 2. Start Processing (Legacy)
      setExecutionLogs(prev => [...prev, "• Starting FFmpeg pipeline..."])
      const processRes = await fetch(`${API_BASE}/process-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: jobId, intent })
      })
      if (!processRes.ok) throw new Error('Processing start failed')

      const processData = await processRes.json()
      const activeJobId = processData.newJobId || jobId
      if (!activeJobId) {
        throw new Error("No job ID returned from processing start")
      }
      setJobId(activeJobId) // Update current job ID

      // 3. Poll Status
      const interval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/status/${activeJobId}`)
          const statusData = await statusRes.json()

          if (statusData.logs && statusData.logs.length > 0) {
            const recent = statusData.logs.slice(-3).map((l: string) => `• ${l.replace(/^\[.*?\] /, '')}`)
            setExecutionLogs(prev => [...prev, ...recent.filter((r: string) => !prev.includes(r))].slice(-10))
          }

          if (statusData.stage === 'completed') {
            clearInterval(interval)
            setProgress(100)
            setIsProcessing(false)
            setExecutionLogs(prev => [...prev, "• Processing Complete!"])

            // Add to History
            const newUrl = `${API_BASE}/download/${activeJobId}`
            setHistory(prev => {
              const newHistory = prev.slice(0, historyIndex + 1)
              newHistory.push({
                url: newUrl,
                prompt: promptText,
                timestamp: Date.now(),
                jobId: activeJobId
              })
              return newHistory
            })
            setHistoryIndex(prev => prev + 1)

            setShowBefore(false)
          } else if (statusData.stage === 'failed') {
            clearInterval(interval)
            setIsProcessing(false)
            setExecutionLogs(prev => [...prev, "❌ Processing Failed"])
          } else {
            setProgress(Math.max(20, statusData.progress || 0))
          }
        } catch (e) {
          console.error(e)
        }
      }, 1000)

    } catch (err: any) {
      console.error(err)
      setIsProcessing(false)
      setExecutionLogs(prev => [...prev, `❌ Error: ${err.message}`])
    }
  }

  return (
    <div className="h-screen w-full bg-[#0a0a0f] text-foreground overflow-hidden">
      {/* 3-Panel Layout */}
      <div className="h-full grid grid-cols-[320px_1fr_360px] gap-0">
        {/* Left Panel - Input & Prompt */}
        <div className="h-full border-r border-white/5 bg-[#12121a] flex flex-col">
          <div className="p-6 border-b border-white/5">
            <h2 className="text-sm font-medium text-white/60 tracking-wide uppercase">Input</h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            <VideoUploadZone
              onFilesSelected={(files) => { if (files.length > 0) handleVideoUpload(files[0]) }}
              hasFiles={!!videoFile}
            />
            <PromptPanel onExecute={handlePromptExecute} isProcessing={isProcessing} disabled={!videoFile} />
          </div>
        </div>

        {/* Center Panel - Video Preview */}
        <div className="h-full bg-[#0a0a0f] flex flex-col">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h1 className="text-sm font-medium text-white/60 tracking-wide uppercase">Preview</h1>
            <div className="flex items-center gap-2">
              {/* History Controls */}
              <div className="flex bg-white/5 rounded-md border border-white/10 mr-2">
                <button
                  onClick={() => setHistoryIndex(i => Math.max(0, i - 1))}
                  disabled={historyIndex <= 0}
                  className="px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-30 transition-colors border-r border-white/10"
                >
                  Undo
                </button>
                <button
                  onClick={() => setHistoryIndex(i => Math.min(history.length - 1, i + 1))}
                  disabled={historyIndex >= history.length - 1}
                  className="px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-30 transition-colors"
                >
                  Redo
                </button>
              </div>

              {historyIndex >= 0 && (
                <span className="text-xs text-white/40 mr-2">
                  {historyIndex + 1} / {history.length}
                </span>
              )}

              {videoUrl && (
                <button
                  onClick={() => setShowBefore(!showBefore)}
                  className="px-3 py-1.5 text-xs rounded-md bg-white/5 hover:bg-white/10 transition-colors border border-white/10 font-mono text-white/80"
                >
                  {showBefore ? "Before" : "After"}
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center p-8">
            <VideoPreview videoUrl={videoUrl} isProcessing={isProcessing} showBefore={showBefore} progress={progress} />
          </div>
        </div>

        {/* Right Panel - System Intelligence */}
        <div className="h-full border-l border-white/5 bg-[#12121a] flex flex-col overflow-hidden">
          <div className="p-6 border-b border-white/5">
            <h2 className="text-sm font-medium text-white/60 tracking-wide uppercase">System</h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            <SystemIntelligence
              interpretation={interpretation}
              ffmpegCommand={ffmpegCommand}
              executionLogs={executionLogs}
              progress={progress}
              isProcessing={isProcessing}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
