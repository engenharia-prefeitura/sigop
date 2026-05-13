import React, { useRef, useEffect, useState } from 'react';

interface RichTextEditorProps {
    initialValue: string;
    onChange: (html: string) => void;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ initialValue, onChange, disabled, placeholder, className }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [isFocused, setIsFocused] = useState(false);

    // Sync with parent state changes (safely)
    useEffect(() => {
        if (editorRef.current) {
            // Safe migration of old tags if they exist
            // Note: browser execCommand uses <b>/<i> or <strong>/<em> depending on browser, 
            // but we handle initial render.
            let val = initialValue;

            // Simple check to avoid cursor jumping: only update if not focused OR if content is drastically different
            // (This is the tricky part of React contentEditable. Best practice is to block updates while focused)
            if (document.activeElement !== editorRef.current) {
                if (editorRef.current.innerHTML !== val) {
                    editorRef.current.innerHTML = val;
                }
            }
        }
    }, [initialValue]);

    const handleInput = () => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
        }
    };

    const execCmd = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
            editorRef.current.focus();
        }
    };

    return (
        <div className={`flex flex-col rounded-lg border transition-all bg-white relative group ${isFocused ? 'border-primary ring-2 ring-blue-50 z-20' : 'border-gray-200'} ${className}`}>
            <style>{`
                .rich-text-content ul { list-style-type: disc; margin-left: 20px; }
                .rich-text-content ol { list-style-type: decimal; margin-left: 20px; }
                .rich-text-content li { margin-bottom: 4px; }
            `}</style>

            {!disabled && (
                <div className="flex items-center gap-1 p-2 border-b border-gray-100 bg-gray-50/50 rounded-t-lg select-none sticky top-0 z-10">
                    <ToolbarButton onClick={() => execCmd('bold')} icon="format_bold" title="Negrito (Ctrl+B)" />
                    <ToolbarButton onClick={() => execCmd('italic')} icon="format_italic" title="Itálico (Ctrl+I)" />
                    <ToolbarButton onClick={() => execCmd('underline')} icon="format_underlined" title="Sublinhado (Ctrl+U)" />

                    <div className="w-px h-4 bg-gray-300 mx-1"></div>

                    <ToolbarButton onClick={() => execCmd('insertUnorderedList')} icon="format_list_bulleted" title="Lista com Marcadores" />
                    <ToolbarButton onClick={() => execCmd('insertOrderedList')} icon="format_list_numbered" title="Lista Numerada" />
                    <ToolbarButton onClick={() => execCmd('indent')} icon="format_indent_increase" title="Aumentar Recuo" />
                    <ToolbarButton onClick={() => execCmd('outdent')} icon="format_indent_decrease" title="Diminuir Recuo" />

                    <div className="w-px h-4 bg-gray-300 mx-1"></div>

                    <ToolbarButton onClick={() => execCmd('justifyLeft')} icon="format_align_left" title="Alinhar à Esquerda" />
                    <ToolbarButton onClick={() => execCmd('justifyCenter')} icon="format_align_center" title="Centralizar" />
                    <ToolbarButton onClick={() => execCmd('justifyRight')} icon="format_align_right" title="Alinhar à Direita" />
                    <ToolbarButton onClick={() => execCmd('justifyFull')} icon="format_align_justify" title="Justificar" />

                    <div className="w-px h-4 bg-gray-300 mx-1"></div>

                    <ToolbarButton onClick={() => execCmd('removeFormat')} icon="format_clear" title="Limpar Formatação" />

                    <div className="w-px h-4 bg-gray-300 mx-1"></div>

                    <ToolbarButton onClick={() => execCmd('undo')} icon="undo" title="Desfazer" />
                    <ToolbarButton onClick={() => execCmd('redo')} icon="redo" title="Refazer" />

                    <div className="flex-1"></div>
                    <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider px-2 pointer-events-none">Pro Editor</span>
                </div>
            )}

            <div
                ref={editorRef}
                contentEditable={!disabled}
                className={`w-full min-h-[150px] p-4 outline-none text-[#111318] text-base leading-relaxed bg-white rounded-b-lg font-serif text-justify ${disabled ? 'opacity-70 bg-transparent' : ''} rich-text-content`}
                onInput={handleInput}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={(e) => {
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        execCmd('insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;');
                    }
                }}
                suppressContentEditableWarning={true}
            />
        </div>
    );
};

const ToolbarButton = ({ onClick, icon, title }: any) => (
    <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        className="size-8 hover:bg-white hover:shadow-sm hover:text-primary rounded text-gray-500 transition-all flex items-center justify-center active:scale-95"
        title={title}
    >
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
    </button>
);

export default RichTextEditor;
