"use client"

import { cn } from "@/lib/utils"
import { useState, useRef, useEffect } from "react"
import { ChevronDown } from "lucide-react"

export interface StyleCardProps {
    onSelect?: (style: string) => void
}

export function StyleCard({ onSelect }: StyleCardProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [selectedStyle, setSelectedStyle] = useState<string>("")
    const dropdownRef = useRef<HTMLDivElement>(null)

    const styles = [
        { name: "Grayscale", bg: "bg-zinc-600", text: "text-zinc-100", border: "border-zinc-500" },
        { name: "Sepia", bg: "bg-[#704214]", text: "text-[#e3dac9]", border: "border-[#8a5a2b]" },
        { name: "Cinematic", bg: "bg-slate-900", text: "text-cyan-400", border: "border-cyan-900" },
        { name: "Retro", bg: "bg-orange-100", text: "text-red-900", border: "border-orange-300" },
        { name: "Warm", bg: "bg-orange-500", text: "text-yellow-100", border: "border-orange-600" },
        { name: "Cool", bg: "bg-blue-600", text: "text-blue-100", border: "border-blue-400" },
        { name: "Vibrant", bg: "bg-fuchsia-600", text: "text-white", border: "border-fuchsia-400" },
    ]

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const handleSelect = (style: string) => {
        setSelectedStyle(style)
        setIsOpen(false)
        onSelect?.(style)
    }

    return (
        <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider">Available Styles</h3>
            </div>

            <div className="relative" ref={dropdownRef}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full bg-[#1a1a24] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500/50 hover:border-white/20 transition-all font-medium flex items-center justify-between"
                >
                    <span>{selectedStyle || "Select a style..."}</span>
                    <ChevronDown className={cn("w-4 h-4 text-white/50 transition-transform duration-200", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a24] border border-white/10 rounded-xl overflow-hidden z-50 shadow-xl shadow-black/50 p-1 space-y-1">
                        {styles.map((style) => (
                            <button
                                key={style.name}
                                onClick={() => handleSelect(style.name)}
                                className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
                            >
                                <div className={cn("w-2 h-2 rounded-full", style.bg)} />
                                {style.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
