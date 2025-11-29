'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { CaretDown, CaretRight, CheckCircle, CircleNotch, PauseCircle, Robot, Crown, FilmStrip, Scroll, MagicWand, VideoCamera } from '@phosphor-icons/react';

interface AgentCardProps {
    agentName: string;
    status: 'working' | 'done' | 'waiting' | 'failed';
    children?: React.ReactNode;
    isExpanded?: boolean;
    persona?: 'director' | 'scriptwriter' | 'videoproducer' | 'default';
}

export function AgentCard({ agentName, status, children, isExpanded: initialExpanded = true, persona = 'default' }: AgentCardProps) {
    const [isExpanded, setIsExpanded] = useState(initialExpanded);

    const statusConfig = {
        working: { icon: CircleNotch, color: 'text-blue-500', bg: 'bg-blue-50', animate: true },
        done: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', animate: false },
        waiting: { icon: PauseCircle, color: 'text-amber-500', bg: 'bg-amber-50', animate: false },
        failed: { icon: Robot, color: 'text-red-500', bg: 'bg-red-50', animate: false },
    };

    const personaConfig = {
        director: {
            icon: Crown,
            color: 'text-white',
            bg: 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-lg shadow-purple-500/30',
            isPremium: true
        },
        scriptwriter: { icon: Scroll, color: 'text-amber-600', bg: 'bg-amber-100' },
        videoproducer: { icon: VideoCamera, color: 'text-rose-600', bg: 'bg-rose-100' },
        default: { icon: Robot, color: 'text-slate-600', bg: 'bg-slate-100' },
    };

    const config = statusConfig[status];
    const pConfig = personaConfig[persona] || personaConfig.default;
    const StatusIcon = config.icon;
    const PersonaIcon = pConfig.icon;
    const isPremium = (pConfig as any).isPremium;

    return (
        <div className={`w-full rounded-xl bg-white shadow-sm overflow-hidden my-2 transition-all ${isPremium ? 'border border-purple-200 ring-1 ring-purple-100' : 'border border-slate-200'}`}>
            <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${pConfig.bg} relative flex items-center justify-center`}>
                        <PersonaIcon
                            className={`w-4 h-4 ${pConfig.color}`}
                            weight="duotone"
                        />
                        {config.animate && (
                            <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                                <StatusIcon className="w-3 h-3 text-blue-500 animate-spin" weight="bold" />
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span className={`font-semibold text-sm ${isPremium ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600' : 'text-slate-700'}`}>
                            {agentName}
                        </span>
                        {isPremium && <span className="text-[10px] text-purple-400 font-medium uppercase tracking-wider leading-none">Orchestrator</span>}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${config.bg} ${config.color} font-medium capitalize`}>
                        {status}
                    </span>
                    {isExpanded ? (
                        <CaretDown className="w-4 h-4 text-slate-400" />
                    ) : (
                        <CaretRight className="w-4 h-4 text-slate-400" />
                    )}
                </div>
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="px-4 pb-4 pt-0 border-t border-slate-100">
                            <div className="pt-3 space-y-2">
                                {children}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
