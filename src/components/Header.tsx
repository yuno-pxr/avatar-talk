
import { X } from 'lucide-react';
import { useSkin } from '../contexts/SkinContext';
import { SkinAnimation } from './SkinAnimation';

interface HeaderProps {
    onMinimize?: () => void;
    onClose?: () => void;
}

export const Header = ({ onMinimize, onClose }: HeaderProps) => {
    const { getComponentConfig } = useSkin();
    const config = getComponentConfig('header');

    if (config.visible === false) return null;

    const title = config.title ?? "MONOLITH // SYSTEM READY";
    const showMinimize = config.minimizeButton?.visible ?? true;
    const showClose = config.closeButton?.visible ?? true;

    return (
        <div
            className="h-8 draggable flex items-center justify-between px-4 bg-black/20 backdrop-blur-sm border-b border-white/10"
            style={config.style}
        >
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-widest opacity-70">{title}</span>
            </div>
            <div className="flex items-center gap-2 no-drag">
                {showMinimize && (
                    <button
                        onClick={onMinimize}
                        className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors"
                        title="Minimize"
                    >
                        {config.minimizeButton?.icon ? (
                            <SkinAnimation animationKey={config.minimizeButton.icon} className="w-3.5 h-3.5" fallback={<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>} />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        )}
                    </button>
                )}
                {showClose && (
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-red-500/20 rounded text-white/50 hover:text-red-200 transition-colors"
                        title="Close"
                    >
                        {config.closeButton?.icon ? (
                            <SkinAnimation animationKey={config.closeButton.icon} className="w-3.5 h-3.5" fallback={<X size={14} />} />
                        ) : (
                            <X size={14} />
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};
