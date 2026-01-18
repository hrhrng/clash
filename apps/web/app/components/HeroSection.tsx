'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
    PaperPlaneRight,
    FilmSlate,
    Microphone,
    Sparkle
} from '@phosphor-icons/react';
import { createProject } from '../actions';

export default function HeroSection() {
    const [inputValue, setInputValue] = useState('');
    const [isPending, startTransition] = useTransition();

    const handleSend = () => {
        if (inputValue.trim()) {
            startTransition(async () => {
                await createProject(inputValue);
            });
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[75vh] w-full max-w-5xl mx-auto px-6">
            <motion.h1
                className="mb-10 text-6xl md:text-7xl font-bold tracking-tighter text-gray-900 text-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                Hey! <br />
                Let's make some <span className="text-brand">CLASH?</span>
            </motion.h1>

            {/* Chat Input - Gemini Style */}
            <div className="w-full max-w-4xl">
                <div className="group relative rounded-[2rem] border border-gray-200 bg-white p-2 shadow-sm transition-all duration-300 hover:shadow-md focus-within:shadow-xl focus-within:border-gray-300">
                    <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Describe your video idea... e.g., 'Create a 60-second product demo video with subtitles'"
                        className="w-full resize-none rounded-2xl bg-transparent px-6 py-4 text-xl text-gray-900 placeholder:text-gray-400 focus:outline-none"
                        rows={3}
                        disabled={isPending}
                    />
                    <div className="flex items-center justify-between px-4 pb-2">
                        <div className="flex gap-2">
                            <motion.button
                                className="rounded-full p-3 transition-colors hover:bg-gray-100"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                            >
                                <FilmSlate
                                    className="h-6 w-6 text-gray-500"
                                    weight="regular"
                                />
                            </motion.button>
                            <motion.button
                                className="rounded-full p-3 transition-colors hover:bg-gray-100"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                            >
                                <Microphone
                                    className="h-6 w-6 text-gray-500"
                                    weight="regular"
                                />
                            </motion.button>
                        </div>
                        <motion.button
                            onClick={handleSend}
                            disabled={!inputValue.trim() || isPending}
                            className={`flex items-center gap-2 rounded-full px-6 py-3 transition-all ${inputValue.trim() && !isPending
                                ? 'bg-gray-900 text-white shadow-lg hover:bg-brand'
                                : 'cursor-not-allowed bg-gray-100 text-gray-400'
                                }`}
                            whileHover={inputValue.trim() && !isPending ? { scale: 1.05 } : {}}
                            whileTap={inputValue.trim() && !isPending ? { scale: 0.95 } : {}}
                        >
                            {isPending ? (
                                <Sparkle className="h-5 w-5 animate-spin" weight="fill" />
                            ) : (
                                <PaperPlaneRight className="h-5 w-5" weight="fill" />
                            )}
                            <span className="text-base font-medium">
                                {isPending ? 'Creating...' : 'Generate'}
                            </span>
                        </motion.button>
                    </div>
                </div>
            </div>
        </div>
    );
}
