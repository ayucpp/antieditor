'use client';

import React, { useState } from 'react';
import { Upload, Wand2, Terminal, Play, CheckCircle } from 'lucide-react';

export default function V2LabPage() {
    const [file, setFile] = useState<File | null>(null);
    const [prompt, setPrompt] = useState('Make it cinematic and boost dialogue');
    const [plan, setPlan] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const handleProcess = async () => {
        if (!file || !prompt) return;

        setLoading(true);
        setPlan(null);

        const formData = new FormData();
        formData.append('video', file);
        formData.append('prompt', prompt);

        try {
            const res = await fetch('http://localhost:3002/v2/process', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            setPlan(data);
        } catch (e) {
            console.error(e);
            alert('Failed to connect to v2 Engine');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white font-sans p-8">
            <header className="mb-12 border-b border-white/10 pb-6">
                <h1 className="text-4xl font-bold tracking-tight mb-2 bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                    DaVinci Engine v2 <span className="text-sm font-mono text-white/40 ml-4">LABS</span>
                </h1>
                <p className="text-white/60">Using Graph Architecture & Neural Intent</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-7xl mx-auto">

                {/* Input Section */}
                <div className="space-y-8">
                    <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                            <Upload className="w-5 h-5 text-purple-400" /> Source Media
                        </h2>

                        <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-white/20 rounded-xl cursor-pointer hover:border-purple-500/50 hover:bg-white/5 transition-all group">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                {file ? (
                                    <div className="text-center">
                                        <CheckCircle className="w-10 h-10 text-green-500 mb-3 mx-auto" />
                                        <p className="text-sm font-medium">{file.name}</p>
                                        <p className="text-xs text-white/40 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="w-10 h-10 text-white/20 mb-3 group-hover:text-purple-400 transition-colors" />
                                        <p className="text-sm text-white/60">Click to upload video</p>
                                    </>
                                )}
                            </div>
                            <input type="file" className="hidden" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        </label>
                    </div>

                    <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                            <Wand2 className="w-5 h-5 text-pink-400" /> Neural Prompt
                        </h2>
                        <textarea
                            className="w-full bg-black/50 border border-white/20 rounded-xl p-4 text-lg focus:outline-none focus:border-pink-500 transition-colors h-32 resize-none leading-relaxed"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Describe your vision..."
                        />
                        <button
                            onClick={handleProcess}
                            disabled={loading || !file}
                            className="mt-6 w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-bold text-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
                        >
                            {loading ? (
                                <span className="animate-pulse">Reasoning...</span>
                            ) : (
                                <>
                                    <Play className="w-5 h-5 fill-current" /> Compile Graph
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Output Section */}
                <div className="space-y-8">
                    <div className="p-6 rounded-2xl bg-white/5 border border-white/10 h-full min-h-[500px] flex flex-col">
                        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                            <Terminal className="w-5 h-5 text-green-400" /> Engine Plan
                        </h2>

                        {plan ? (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <p className="text-xs font-mono uppercase tracking-wider text-white/40 mb-2">Intent Matrix</p>
                                    <div className="bg-black/50 rounded-lg p-4 border border-white/10 overflow-hidden">
                                        <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">
                                            {JSON.stringify(plan.intent, null, 2)}
                                        </pre>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-xs font-mono uppercase tracking-wider text-white/40 mb-2">FFmpeg Compiler Output</p>
                                    <div className="bg-gray-900 rounded-lg p-4 border border-white/10 overflow-x-auto">
                                        <code className="text-sm text-yellow-500 font-mono block min-w-max">
                                            {plan.ffmpegCommand}
                                        </code>
                                    </div>
                                </div>

                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                                    <p className="text-sm text-blue-200">
                                        <strong>Plan Verified.</strong> The engine has successfully translated your natural language intent into a deterministic node graph.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-white/20 border-2 border-dashed border-white/5 rounded-xl">
                                <Terminal className="w-16 h-16 mb-4 opacity-20" />
                                <p>Waiting for input data...</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
