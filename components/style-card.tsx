"use client"

import { cn } from "@/lib/utils"

export function StyleCard() {
    const styles = [
        { name: "Grayscale", bg: "bg-zinc-600", text: "text-zinc-100", border: "border-zinc-500" },
        { name: "Sepia", bg: "bg-[#704214]", text: "text-[#e3dac9]", border: "border-[#8a5a2b]" },
        { name: "Cinematic", bg: "bg-slate-900", text: "text-cyan-400", border: "border-cyan-900" },
        { name: "Retro", bg: "bg-orange-100", text: "text-red-900", border: "border-orange-300" },
        { name: "Warm", bg: "bg-orange-500", text: "text-yellow-100", border: "border-orange-600" },
        { name: "Cool", bg: "bg-blue-600", text: "text-blue-100", border: "border-blue-400" },
        { name: "Vibrant", bg: "bg-fuchsia-600", text: "text-white", border: "border-fuchsia-400" },
    ]

    return (
        <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider">Available Styles</h3>
            </div>

            <div className="grid grid-cols-2 gap-2">
                {styles.map((style) => (
                    <div
                        key={style.name}
                        className={cn(
                            "px-3 py-2 rounded-md text-xs font-medium text-center border transition-all hover:scale-[1.02] cursor-default select-none",
                            style.bg,
                            style.text,
                            style.border
                        )}
                    >
                        {style.name}
                    </div>
                ))}
            </div>
        </div>
    )
}
