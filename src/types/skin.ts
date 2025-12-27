import React from 'react';

export interface SkinMetadata {
    name: string;
    version: string;
    author?: string;
    description?: string;
}

export interface SkinAssets {
    /** Map of asset keys to file paths relative to the skin folder */
    images?: Record<string, string>;
    /** Map of animation keys to Lottie JSON files or Rive files */
    animations?: Record<string, {
        type: 'lottie' | 'rive';
        path: string;
        /** Auto-play the animation */
        autoplay?: boolean;
        /** Loop the animation */
        loop?: boolean;
        /** State machine name for Rive */
        stateMachine?: string;
    }>;
}

export interface SkinStyles {
    /** Path to a CSS file to inject relative to the skin folder */
    cssFile?: string;
    /** Resolved absolute URL to the CSS file (runtime only) */
    cssFileUrl?: string;
    /** Custom colors to override default theme tokens */
    colors?: {
        primary?: string;
        secondary?: string;
        background?: string;
        text?: string;
        [key: string]: string | undefined;
    };
}

export interface SkinComponentConfig {
    [componentId: string]: {
        [property: string]: any;
        visible?: boolean;
        style?: React.CSSProperties;
    };
}

export interface SkinDefinition {
    metadata: SkinMetadata;
    assets?: SkinAssets;
    styles?: SkinStyles;
    components?: SkinComponentConfig;
}
