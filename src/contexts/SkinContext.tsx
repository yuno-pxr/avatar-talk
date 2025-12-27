import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { SkinDefinition, SkinMetadata } from '../types/skin';

interface SkinContextType {
    skin: SkinDefinition | null;
    availableSkins: (SkinMetadata & { id: string })[];
    loadSkin: (skinIdOrData: string | SkinDefinition) => Promise<void>;
    getAssetPath: (key: string) => string | undefined;
    getAnimation: (key: string) => any;
    getComponentConfig: (id: string) => any;
}

const SkinContext = createContext<SkinContextType | undefined>(undefined);

export const SkinProvider = ({ children }: { children: ReactNode }) => {
    const [skin, setSkin] = useState<SkinDefinition | null>(null);
    const [availableSkins, setAvailableSkins] = useState<(SkinMetadata & { id: string })[]>([]);

    useEffect(() => {
        const fetchSkins = async () => {
            if (window.electronAPI?.getAvailableSkins) {
                try {
                    const skins = await window.electronAPI.getAvailableSkins();
                    setAvailableSkins(skins);
                } catch (error) {
                    console.error('Failed to fetch skins:', error);
                }
            }
        };
        fetchSkins();
    }, []);

    const applySkinStyles = (skinData: SkinDefinition) => {
        // Remove existing skin styles
        const existingStyle = document.getElementById('skin-css');
        if (existingStyle) {
            existingStyle.remove();
        }

        const root = document.documentElement;

        // Reset custom properties
        // (Ideally we should track what we set, but for now we rely on overwriting)

        if (skinData.styles?.cssFileUrl) {
            let link = document.getElementById('skin-css') as HTMLLinkElement;
            if (!link) {
                link = document.createElement('link');
                link.id = 'skin-css';
                link.rel = 'stylesheet';
                document.head.appendChild(link);
            }
            link.href = skinData.styles.cssFileUrl;
        } else if (skinData.styles?.cssFile) {
            // Fallback if URL not provided but local filename is (though we need absolute path usually)
            console.warn('cssFile provided without resolved URL');
        }

        if (skinData.styles?.colors) {
            Object.entries(skinData.styles.colors).forEach(([key, value]) => {
                if (value) {
                    root.style.setProperty(`--skin-${key}`, value);
                }
            });
        }
    };

    const loadSkin = async (skinIdOrData: string | SkinDefinition) => {
        let skinData: SkinDefinition | null = null;

        if (typeof skinIdOrData === 'string') {
            if (skinIdOrData === 'default') {
                setSkin(null);
                const existingStyle = document.getElementById('skin-css');
                if (existingStyle) existingStyle.remove();
                return;
            }

            if (window.electronAPI?.loadSkin) {
                try {
                    skinData = await window.electronAPI.loadSkin(skinIdOrData);
                } catch (error) {
                    console.error(`Failed to load skin ${skinIdOrData}:`, error);
                }
            }
        } else {
            skinData = skinIdOrData;
        }

        if (skinData) {
            setSkin(skinData);
            applySkinStyles(skinData);
        }
    };

    const getAssetPath = (key: string) => {
        return skin?.assets?.images?.[key];
    };

    const getAnimation = (key: string) => {
        return skin?.assets?.animations?.[key];
    };

    const getComponentConfig = (id: string) => {
        return skin?.components?.[id] || {};
    };

    return (
        <SkinContext.Provider value={{ skin, availableSkins, loadSkin, getAssetPath, getAnimation, getComponentConfig }}>
            {children}
        </SkinContext.Provider>
    );
};

export const useSkin = () => {
    const context = useContext(SkinContext);
    if (context === undefined) {
        throw new Error('useSkin must be used within a SkinProvider');
    }
    return context;
};
