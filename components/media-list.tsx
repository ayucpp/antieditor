import { FileVideo, Music, Clock } from "lucide-react"

interface MediaListProps {
    media: any[]
}

export function MediaList({ media }: MediaListProps) {
    console.log("[MediaList Rendering] items:", media?.length)
    if (!media || media.length === 0) return null

    return (
        <div className="px-6 py-4 border-b border-white/5">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Project Bin</h3>
            <div className="space-y-2">
                {media.map((item, index) => (
                    <div
                        key={index}
                        className="group flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors relative"
                    >
                        <div className="flex-shrink-0 w-12 h-6 rounded bg-indigo-500/10 flex items-center justify-center text-[10px] font-mono text-indigo-400 font-bold border border-indigo-500/20 uppercase">
                            Clip {index + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                {item.type === 'video' ? (
                                    <FileVideo className="w-3 h-3 text-blue-400/70" />
                                ) : (
                                    <Music className="w-3 h-3 text-purple-400/70" />
                                )}
                                <span className="text-sm text-white/90 truncate font-medium">{item.filename}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 text-[10px] text-white/40 font-mono">
                                    <Clock className="w-2 h-2" />
                                    <span>{item.duration?.toFixed(1)}s</span>
                                </div>
                                {item.fps && (
                                    <span className="text-[10px] text-white/20 font-mono px-1 border border-white/5 rounded">
                                        {item.fps}fps
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Visual hint for referencing */}
                        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[8px] text-white/20 font-mono uppercase tracking-tighter">Ref id: Clip {index + 1}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
