"use client"

import type React from "react"

import { useState } from "react"
import { Play, Sparkles } from "lucide-react"

interface PromptPanelProps {
  onExecute: (prompt: string) => void
  isProcessing: boolean
  disabled: boolean
}

const SUGGESTIONS = [
  "Remove silence from the video",
  "Trim first 10 seconds",
  "Add fade in and fade out",
  "Increase audio volume by 50%",
  "Extract first minute",
]

export function PromptPanel({ onExecute, isProcessing, disabled }: PromptPanelProps) {
  const [prompt, setPrompt] = useState("")

  const handleExecute = () => {
    if (prompt.trim() && !disabled) {
      onExecute(prompt)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleExecute()
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Prompt Textarea */}
      <div className="relative">
        <div className="absolute -inset-[1px] bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Describe how you want to edit your video…"
          className={`
            relative w-full min-h-[200px] px-4 py-3 bg-[#1a1a24] rounded-xl
            border border-white/10 focus:border-indigo-500/50 focus:outline-none
            text-[13px] leading-relaxed font-mono text-white/90
            placeholder:text-white/30 resize-none transition-all
            shadow-[inset_0_2px_8px_rgba(0,0,0,0.3)]
            ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-text"}
          `}
        />
      </div>

      {/* Execute Button */}
      <button
        onClick={handleExecute}
        disabled={disabled || !prompt.trim() || isProcessing}
        className={`
          w-full py-3 px-4 rounded-lg font-medium text-sm
          transition-all duration-200 flex items-center justify-center gap-2
          ${
            disabled || !prompt.trim() || isProcessing
              ? "bg-white/5 text-white/30 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40"
          }
        `}
      >
        {isProcessing ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Processing...</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            <span>Execute</span>
            <span className="text-xs text-white/50 ml-auto">⌘↵</span>
          </>
        )}
      </button>

      {/* Suggestion Chips */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Sparkles className="w-3 h-3" />
          <span>Suggestions</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => !disabled && setPrompt(suggestion)}
              disabled={disabled}
              className={`
                px-3 py-1.5 text-xs rounded-md bg-white/[0.03] hover:bg-white/[0.06]
                border border-white/10 hover:border-white/20 transition-all
                text-white/60 hover:text-white/80
                ${disabled ? "opacity-50 cursor-not-allowed" : ""}
              `}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
