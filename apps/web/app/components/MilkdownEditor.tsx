'use client';

import { useRef } from 'react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { nord } from '@milkdown/theme-nord';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { prism } from '@milkdown/plugin-prism';
import { trailing } from '@milkdown/plugin-trailing';
import { history } from '@milkdown/plugin-history';
import { $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';

import '@milkdown/theme-nord/style.css';
import 'prismjs/themes/prism.css';

interface MilkdownEditorProps {
    value: string;
    onChange: (value: string) => void;
}

// Ensure the document starts with a paragraph
const ensureStartingParagraph = $prose(() => {
    const key = new PluginKey('ensure-starting-paragraph');
    return new Plugin({
        key,
        appendTransaction: (transactions, oldState, newState) => {
            const { doc, schema, tr } = newState;

            // Check if the first node is not a paragraph
            if (doc.firstChild && doc.firstChild.type.name !== 'paragraph') {
                // Insert an empty paragraph at the start
                const paragraph = schema.nodes.paragraph.create();
                const transaction = tr.insert(0, paragraph);
                return transaction;
            }

            return null;
        },
    });
});

function MilkdownEditorInner({ value, onChange }: MilkdownEditorProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEditor((root) =>
        Editor.make()
            .config((ctx) => {
                ctx.set(rootCtx, root);
                ctx.set(defaultValueCtx, value);
            })
            .config(nord)
            .use(commonmark)
            .use(listener)
            .use(prism)
            .use(history)
            .use(trailing)
            .use(ensureStartingParagraph)
            .config((ctx) => {
                ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
                    onChange(markdown);
                });
            })
    );

    const handleClick = () => {
        // Click editor area to focus
        const editorElement = wrapperRef.current?.querySelector('.ProseMirror') as HTMLElement;
        if (editorElement) {
            editorElement.focus();
        }
    };

    return (
        <div
            ref={wrapperRef}
            className="milkdown-editor-wrapper px-12 pb-8"
            onClick={handleClick}
        >
            <Milkdown />
        </div>
    );
}

export default function MilkdownEditor({ value, onChange }: MilkdownEditorProps) {
    return (
        <MilkdownProvider>
            <MilkdownEditorInner value={value} onChange={onChange} />
        </MilkdownProvider>
    );
}
