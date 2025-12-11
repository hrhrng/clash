import React from 'react';
import { EditorProvider, useEditor } from '@remotion-fast/core';
import { CanvasPreview } from './CanvasPreview';
import { Timeline } from './Timeline';
import { AssetPanel } from './AssetPanel';
import { PropertiesPanel } from './PropertiesPanel';

const AssetInitializer = ({ assets }: { assets: any[] }) => {
  const { dispatch } = useEditor();
  React.useEffect(() => {
    if (assets && assets.length > 0) {
      // Clear existing assets first? Maybe not, or maybe yes.
      // For now, just add.
      assets.forEach(asset => {
        dispatch({
          type: 'ADD_ASSET',
          payload: {
            id: asset.id || `asset-${Date.now()}-${Math.random()}`,
            type: asset.type === 'video' ? 'video' : asset.type === 'image' ? 'image' : 'audio',
            src: asset.src || asset.url,
            name: asset.name || 'Imported Asset',
            createdAt: Date.now(),
            readOnly: true,
          }
        });
      });
    }
  }, [assets, dispatch]);
  return null;
};

export const Editor: React.FC<{ initialAssets?: any[] }> = ({ initialAssets }) => {
  return (
    <EditorProvider>
      <AssetInitializer assets={initialAssets || []} />
      <div className="w-full h-full flex flex-col bg-white font-sans text-slate-900">
        {/* Header removed as requested */}

        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Assets */}
          <aside className="w-[280px] shrink-0 border-r border-slate-200 bg-slate-50/50">
            <AssetPanel />
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col min-w-0 bg-slate-50/30">
            {/* Top Row - Preview and Properties */}
            <div className="flex-1 flex min-h-0">
              <div className="flex-1 min-h-0 p-4 flex items-center justify-center bg-slate-100/50">
                <div className="w-full h-full shadow-lg rounded-lg overflow-hidden ring-1 ring-slate-900/5 bg-white">
                  <CanvasPreview />
                </div>
              </div>
              <aside className="w-[320px] shrink-0 border-l border-slate-200 bg-white">
                <PropertiesPanel />
              </aside>
            </div>

            {/* Timeline Area - Full Width */}
            <div className="h-[300px] shrink-0 border-t border-slate-200 bg-white z-0 relative">
              <Timeline />
            </div>
          </main>
        </div>
      </div>
    </EditorProvider>
  );
};
