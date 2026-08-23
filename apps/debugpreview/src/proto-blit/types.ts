export type PecaPalcoItem = {
  assetId: string;
  gx: number;
  gy: number;
  qx?: number;
  qy?: number;
  passo?: number;
  papel?: string;
  face?: 'R' | 'L';
  dx?: number;
  dy?: number;
};
