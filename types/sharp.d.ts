declare module 'sharp' {
  export interface SharpOptions {
    limitInputPixels?: number | boolean;
    animated?: boolean;
  }

  export interface ResizeOptions {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    withoutEnlargement?: boolean;
  }

  export interface Metadata {
    format?: string;
    width?: number;
    height?: number;
    pages?: number;
  }

  export interface CompositeOptions {
    input: Buffer | string;
    blend?: 'dest-in' | string;
    gravity?: string;
  }

  export interface Sharp {
    resize(width?: number | ResizeOptions, height?: number, options?: ResizeOptions): Sharp;
    ensureAlpha(): Sharp;
    png(): Sharp;
    webp(options?: { quality?: number; effort?: number }): Sharp;
    modulate(options?: { brightness?: number; saturation?: number }): Sharp;
    sharpen(options?: { sigma?: number }): Sharp;
    extend(options: {
      top?: number;
      bottom?: number;
      left?: number;
      right?: number;
      background?: { r: number; g: number; b: number; alpha?: number };
    }): Sharp;
    composite(images: CompositeOptions[]): Sharp;
    metadata(): Promise<Metadata>;
    toBuffer(): Promise<Buffer>;
  }

  interface SharpConstructor {
    (input?: Buffer | string, options?: SharpOptions): Sharp;
  }

  const sharp: SharpConstructor;
  export default sharp;
}
