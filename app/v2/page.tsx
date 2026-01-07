"use client"

import { useState } from "react"
import { VideoUploadZone } from "@/components/video-upload-zone"
import { MediaList } from "@/components/media-list"
import { PromptPanel } from "@/components/prompt-panel"
import { VideoPreview } from "@/components/video-preview"
import { SystemIntelligence } from "@/components/system-intelligence"

export default function VideoEditorPageV2() {
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [mediaList, setMediaList] = useState<any[]>([])
    const [videoUrl, setVideoUrl] = useState<string | null>(null)

    const [prompt, setPrompt] = useState("")
    const [isProcessing, setIsProcessing] = useState(false)
    const [showBefore, setShowBefore] = useState(true)

    const [interpretation, setInterpretation] = useState<string | null>(null)
    const [ffmpegCommand, setFfmpegCommand] = useState<string | null>(null)
    const [executionLogs, setExecutionLogs] = useState<string[]>([])
    const [progress, setProgress] = useState(0)

    // V2 Engine URL
    const API_BASE = "http://localhost:3002/v2"

    const playNotificationSound = () => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;

            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            // "Click" sound
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);
            osc.type = 'sine';

            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

            osc.start();
            osc.stop(ctx.currentTime + 0.05);
        } catch (e) {
            console.error("Audio feedback failed", e);
        }
    }

    const handleIngest = async (files: File[]) => {
        setIsProcessing(true)
        const validFiles = files.filter(f => f.type.startsWith('video/') || f.type.startsWith('audio/'))
        if (validFiles.length === 0) return

        const isAudioOnly = validFiles.every(f => f.type.startsWith('audio/'))
        const normalizationMsg = isAudioOnly ? "• Normalizing audio format..." : "• Normalizing resolution/fps..."

        setExecutionLogs(["• Ingesting media...", normalizationMsg])
        setProgress(10)

        const formData = new FormData()
        if (sessionId) formData.append('sessionId', sessionId)
        files.forEach(f => formData.append('files', f))

        try {
            const res = await fetch(`${API_BASE}/upload`, {
                method: 'POST',
                body: formData
            })
            const data = await res.json()
            console.log("[Ingest Response]", data)

            if (data.sessionId) {
                setSessionId(data.sessionId)
                setMediaList(data.media)
                console.log("[State Updated] mediaList:", data.media)
                setVideoUrl(null) // Reset preview
                setExecutionLogs(prev => [...prev, `✅ Session Ready: ${data.media.length} clips normalized.`])
                setProgress(100)
            }
        } catch (e) {
            console.error(e)
            setExecutionLogs(prev => [...prev, "❌ Upload Failed"])
        } finally {
            setIsProcessing(false)
        }
    }

    const handlePromptExecute = async (promptText: string) => {
        if (!sessionId) {
            alert("Please upload media first")
            return
        }

        setPrompt(promptText)
        setIsProcessing(true)
        setProgress(0)
        setExecutionLogs([])
        setShowBefore(true)

        const formData = new FormData()
        formData.append('sessionId', sessionId)
        formData.append('prompt', promptText)

        try {
            setExecutionLogs(prev => [...prev, "• Sending prompt to Neural Engine (v2)..."])
            setProgress(20)

            const res = await fetch(`${API_BASE}/process`, {
                method: 'POST',
                body: formData
            })

            setProgress(50)
            setExecutionLogs(prev => [...prev, "• Graph Compiled. Rendering..."])

            if (!res.ok) throw new Error('V2 Engine Error')

            const data = await res.json()

            // Update System Intelligence
            setInterpretation(JSON.stringify(data.intent, null, 2))
            setFfmpegCommand(data.ffmpegCommand)

            if (data.status === 'completed') {
                setVideoUrl(data.outputUrl)
                setShowBefore(false)
                setProgress(100)
                setExecutionLogs(prev => [...prev, "• Rendering Complete!", "• Streaming output..."])
                playNotificationSound();
            } else {
                throw new Error("Processing failed on backend")
            }

        } catch (err: any) {
            console.error(err)
            setExecutionLogs(prev => [...prev, `❌ Error: ${err.message}`])
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <div className="h-screen w-full bg-[#0a0a0f] text-foreground overflow-hidden">
            <div className="h-full grid grid-cols-[320px_1fr_360px] gap-0">
                {/* Left Panel */}
                <div className="h-full border-r border-white/5 bg-[#12121a] flex flex-col">
                    <div className="p-6 border-b border-white/5 bg-purple-900/10">
                        <h2 className="text-sm font-bold text-purple-400 tracking-wide uppercase">DaVinci Engine v2</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <VideoUploadZone onFilesSelected={handleIngest} hasFiles={!!sessionId} />
                        <MediaList media={mediaList} />
                        <PromptPanel onExecute={handlePromptExecute} isProcessing={isProcessing} disabled={!sessionId} />
                    </div>
                </div>

                {/* Center Panel */}
                <div className="h-full bg-[#0a0a0f] flex flex-col">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <h1 className="text-sm font-medium text-white/60 tracking-wide uppercase">Preview</h1>
                        <div className="flex items-center gap-2">
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

                {/* Right Panel */}
                <div className="h-full border-l border-white/5 bg-[#12121a] flex flex-col overflow-hidden">
                    <div className="p-6 border-b border-white/5">
                        <h2 className="text-sm font-medium text-white/60 tracking-wide uppercase">System Intelligence</h2>
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
