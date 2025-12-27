
export interface EmgSpriteData {
    fps: number;
    loop: number; // 0: None, 1: Loop, 2: Random, 3: Timeline
    useTex: string[]; // URLs or Paths
}

export interface EmgLayer {
    textureID: string;
    imgType: "Texture" | "Sprite";
    assignID?: string; // Optional identifier
    animID?: string;   // For Sprites
    x: number;
    y: number;
    width: number;
    height: number;
    basePosition_x?: number;
    basePosition_y?: number;
    textureZIndex: number;
    sprites?: EmgSpriteData;
}

export interface EmgV2Data {
    version?: string; // e.g. "2.0"
    baseCanvasWidth: number;
    baseCanvasHeight: number;
    layers: EmgLayer[];
}
