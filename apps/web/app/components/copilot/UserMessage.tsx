'use client';

import { motion } from 'framer-motion';

export function UserMessage({ content }: { content: string }) {
    return (
        <div className="flex justify-end">
            <div className="max-w-[82%] items-end">
                <motion.div
                    className="px-4 py-3 rounded-matrix shadow-sm border bg-gradient-to-br from-red-50/90 to-pink-50/90 border-red-100/50 text-gray-900"
                    whileHover={{ scale: 1.02, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                    <p className="text-sm leading-relaxed">{content}</p>
                </motion.div>
            </div>
        </div>
    );
}
