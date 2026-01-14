import React from 'react';
import { EditorProvider, useEditor, type EditorState } from '@master-clash/remotion-core';
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

type EditorProps = {
  initialAssets?: any[];
  initialState?: Partial<EditorState>;
  onStateChange?: (state: EditorState) => void;
};

export const Editor: React.FC<EditorProps> = ({ initialAssets, initialState, onStateChange }) => {
  return (
    <EditorProvider initialState={initialState} onStateChange={onStateChange}>
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
            <div className="flex-1 flex" style={{ minHeight: 0 }}>
              {/* Preview Area */}
              <div
                className="flex-1 p-4 flex items-center justify-center bg-slate-100/50"
                style={{ minHeight: 0 }}
              >
                <div className="w-full h-full rounded-lg overflow-hidden bg-white shadow-lg ring-1 ring-slate-900/5">
                  <CanvasPreview />
                </div>
              </div>
              <aside className="w-[320px] shrink-0 border-l border-slate-200 bg-white">
                <PropertiesPanel />
              </aside>
            </div>

            {/* Timeline Area - Full Width with fixed height */}
            <div
              className="border-t border-slate-200 bg-white relative"
              style={{ height: 300, flexShrink: 0 }}
            >
              <Timeline />
            </div>
          </main>
        </div>
      </div>
    </EditorProvider>
  );
};
