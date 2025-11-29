import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Image as ImageIcon, ArrowsClockwise, CheckCircle } from '@phosphor-icons/react';

const ImageGenNode = ({ data, selected }: NodeProps) => {
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    // Mock generated images
    const images = [
        'https://picsum.photos/seed/cyber1/200/200',
        'https://picsum.photos/seed/cyber2/200/200',
        'https://picsum.photos/seed/cyber3/200/200',
        'https://picsum.photos/seed/cyber4/200/200',
    ];

    const handleGenerate = () => {
        setIsGenerating(true);
        setTimeout(() => setIsGenerating(false), 2000);
    };

    return (
        <div
            className={`group relative min-w-[320px] overflow-hidden rounded-matrix bg-white shadow-lg transition-all duration-300 hover:shadow-xl ${selected ? 'ring-4 ring-pink-500 ring-offset-2' : 'ring-1 ring-slate-100'
                }`}
        >
            {/* Header */}
            <div className="relative flex h-14 items-center justify-between bg-gradient-to-r from-pink-500 to-rose-500 px-4">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                <div className="relative z-10 flex items-center gap-2 text-white">
                    <ImageIcon size={20} weight="fill" />
                    <span className="font-bold text-sm">Image Gen</span>
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="relative z-10 flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-[10px] font-bold text-white hover:bg-white/30 transition-colors disabled:opacity-50"
                >
                    <ArrowsClockwise className={isGenerating ? "animate-spin" : ""} />
                    {isGenerating ? 'Generating...' : 'Reroll'}
                </button>
            </div>

            {/* Grid Content */}
            <div className="p-3">
                <div className="grid grid-cols-2 gap-2">
                    {images.map((src, idx) => (
                        <div
                            key={idx}
                            onClick={() => setSelectedImageIndex(idx)}
                            className={`relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 transition-all ${selectedImageIndex === idx
                                ? 'border-pink-500 ring-2 ring-pink-200'
                                : 'border-transparent hover:border-pink-200'
                                }`}
                        >
                            <img src={src} alt={`Gen ${idx}`} className="h-full w-full object-cover" />

                            {selectedImageIndex === idx && (
                                <div className="absolute right-1 top-1 rounded-full bg-pink-500 p-0.5 text-white shadow-sm">
                                    <CheckCircle size={12} weight="fill" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {selectedImageIndex !== null && (
                    <div className="mt-3 text-center">
                        <span className="text-[10px] font-medium text-slate-400">
                            Selected Image {selectedImageIndex + 1} used for next step
                        </span>
                    </div>
                )}
            </div>

            {/* Handles */}
            <Handle
                type="target"
                position={Position.Left}
                className="!h-4 !w-4 !-translate-x-2 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-pink-500 hover:scale-125 shadow-sm"
            />
            <Handle
                type="source"
                position={Position.Right}
                className="!h-4 !w-4 !translate-x-2 !border-4 !border-white !bg-slate-400 transition-all hover:!bg-pink-500 hover:scale-125 shadow-sm"
            />
        </div>
    );
};

export default memo(ImageGenNode);
