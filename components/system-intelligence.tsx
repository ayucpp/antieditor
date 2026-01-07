"use client"

import { Terminal, Zap, Activity } from "lucide-react"

interface SystemIntelligenceProps {
  interpretation: string | null
  ffmpegCommand: string | null
  executionLogs: string[]
  progress: number
  isProcessing: boolean
}

export function SystemIntelligence({
  interpretation,
  ffmpegCommand,
  executionLogs,
  progress,
  isProcessing,
}: SystemIntelligenceProps) {
  return (
    <div className="p-6 space-y-6">
      {/* Prompt Interpretation */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-white/60 uppercase tracking-wide">
          <Zap className="w-3.5 h-3.5" />
          <span>Interpretation</span>
        </div>
        <div className="rounded-lg bg-[#1a1a24] border border-white/10 p-4 min-h-[80px]">
          {interpretation ? (
            <p className="text-sm text-white/80 leading-relaxed">{interpretation}</p>
          ) : (
            <p className="text-sm text-white/30 italic">No prompt executed yet</p>
          )}
        </div>
      </section>

      {/* FFmpeg Command Preview */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-white/60 uppercase tracking-wide">
          <Terminal className="w-3.5 h-3.5" />
          <span>FFmpeg Command</span>
        </div>
        <div className="rounded-lg bg-[#0a0a0f] border border-white/10 p-4 min-h-[100px] overflow-x-auto">
          {ffmpegCommand ? (
            <pre className="text-xs font-mono text-green-400/90 leading-relaxed whitespace-pre-wrap break-all">
              {ffmpegCommand}
            </pre>
          ) : (
            <p className="text-xs font-mono text-white/30 italic">Command will appear here</p>
          )}
        </div>
      </section>

      {/* Progress Indicator */}
      {isProcessing && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-white/60 uppercase tracking-wide">
            <Activity className="w-3.5 h-3.5" />
            <span>Progress</span>
          </div>
          <div className="space-y-2">
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-white/50 text-right font-mono">{progress}%</p>
          </div>
        </section>
      )}

      {/* Execution Logs */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-white/60 uppercase tracking-wide">
          <Terminal className="w-3.5 h-3.5" />
          <span>Execution Logs</span>
        </div>
        <div className="rounded-lg bg-[#0a0a0f] border border-white/10 p-4 min-h-[200px] max-h-[400px] overflow-y-auto font-mono text-xs">
          {executionLogs.length > 0 ? (
            <div className="space-y-1">
              {executionLogs.map((log, i) => (
                <div key={i} className="text-white/70 animate-fadeIn">
                  {log}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/30 italic">Logs will appear here during execution</p>
          )}
        </div>
      </section>
    </div>
  )
}
