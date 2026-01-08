import { cn } from "@/lib/utils"

interface ExportCardProps {
    selectedFormat: string | null
    onSelect: (format: string | null) => void
}

export function ExportCard({ selectedFormat, onSelect }: ExportCardProps) {
    const formats = [
        { id: "16:9", label: "YouTube", sub: "16:9", icon: "📺" },
        { id: "9:16", label: "Reels", sub: "9:16", icon: "📱" },
        { id: "1:1", label: "Square", sub: "1:1", icon: "🔲" },
        { id: "original", label: "Original", sub: "Native", icon: "🎞️" },
    ]

    return (
        <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider">Export Format</h3>
                {selectedFormat && (
                    <button
                        onClick={() => onSelect(null)}
                        className="text-[10px] text-white/40 hover:text-white/80 transition-colors"
                    >
                        Clear
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 gap-2">
                {formats.map((fmt) => (
                    <button
                        key={fmt.id}
                        onClick={() => onSelect(selectedFormat === fmt.id ? null : fmt.id)}
                        className={cn(
                            "flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg border text-center transition-all",
                            selectedFormat === fmt.id
                                ? "bg-white/10 border-white/40 text-white shadow-sm"
                                : "bg-transparent border-white/5 text-white/40 hover:bg-white/5 hover:text-white/70"
                        )}
                    >
                        <span className="text-xl">{fmt.icon}</span>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-medium leading-tight">{fmt.label}</span>
                            <span className="text-[9px] opacity-50">{fmt.sub}</span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    )
}
