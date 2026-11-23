import type { Attachment, ProviderId } from './types';

const DEFAULT_MAX_SIDE = 2048;
const DEFAULT_QUALITY = 0.85;
const THUMB_SIDE = 160;

const PROVIDER_MAX_SIDE: Record<ProviderId, number> = {
  anthropic: 1568,
  openai: 2048,
  openrouter: 2048,
  deepseek: 2048,
  google: 3072,
  custom: 2048,
};

/** Limite de bytes do base64 por imagem. */
const PROVIDER_MAX_BYTES: Record<ProviderId, number> = {
  anthropic: 4.5 * 1024 * 1024,
  openai: 18 * 1024 * 1024,
  openrouter: 18 * 1024 * 1024,
  deepseek: 18 * 1024 * 1024,
  google: 18 * 1024 * 1024,
  custom: 18 * 1024 * 1024,
};

const PROVIDER_MAX_IMAGES: Record<ProviderId, number> = {
  anthropic: 20,
  openai: 10,
  openrouter: 8,
  deepseek: 4,
  google: 16,
  custom: 5,
};

export function estimateImagesPerMessage(provider: ProviderId): number {
  return PROVIDER_MAX_IMAGES[provider] ?? 5;
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

function isHeic(file: Blob & { name?: string }): boolean {
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  return t.includes('heic') || t.includes('heif') || /\.(heic|heif)$/.test(n);
}

async function decode(blob: Blob & { name?: string }): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      /* fallback abaixo */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('decode'));
      i.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    if (isHeic(blob)) {
      throw new Error(
        'Não foi possível ler esta foto HEIC/HEIF. Este navegador não suporta o formato; converta para JPEG (ex.: ajuste da câmera para "Mais compatível") e tente novamente.'
      );
    }
    throw new Error(`Não foi possível ler a imagem "${blob.name || 'arquivo'}". O arquivo pode estar corrompido ou em formato não suportado.`);
  }
}

function render(d: Decoded, maxSide: number, quality: number): string {
  const scale = Math.min(1, maxSide / Math.max(d.width, d.height));
  const w = Math.max(1, Math.round(d.width * scale));
  const h = Math.max(1, Math.round(d.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível neste navegador.');
  ctx.fillStyle = '#fff'; // evita fundo preto em PNG transparente
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(d.source, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

function stripPrefix(dataUrl: string): string {
  const i = dataUrl.indexOf(',');
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

export async function createAttachment(file: File, index: number): Promise<Attachment> {
  if (!(file.type || '').startsWith('image/') && !isHeic(file)) {
    throw new Error(`"${file.name}" não é uma imagem. Anexe apenas arquivos de imagem.`);
  }
  const d = await decode(file);
  try {
    const aiData = stripPrefix(render(d, DEFAULT_MAX_SIDE, DEFAULT_QUALITY));
    const thumbUrl = render(d, THUMB_SIDE, 0.7);
    return {
      id: `foto_${index}`,
      name: file.name,
      original: file,
      width: d.width,
      height: d.height,
      aiData,
      aiMediaType: 'image/jpeg',
      thumbUrl,
    };
  } finally {
    d.release();
  }
}

/** Re-gera aiData a partir do original respeitando limites do provedor. */
export async function fitForProvider(att: Attachment, provider: ProviderId): Promise<Attachment> {
  const maxSide = PROVIDER_MAX_SIDE[provider] ?? DEFAULT_MAX_SIDE;
  const maxBytes = PROVIDER_MAX_BYTES[provider] ?? 18 * 1024 * 1024;
  const d = await decode(att.original as Blob);
  try {
    let side = maxSide;
    let quality = DEFAULT_QUALITY;
    let data = stripPrefix(render(d, side, quality));
    for (let i = 0; i < 8 && data.length > maxBytes; i++) {
      if (quality > 0.6) quality -= 0.1;
      else side = Math.round(side * 0.8);
      data = stripPrefix(render(d, side, quality));
    }
    if (data.length > maxBytes) throw new Error(`A imagem "${att.name}" é grande demais para ${provider}.`);
    return { ...att, aiData: data, aiMediaType: 'image/jpeg' };
  } finally {
    d.release();
  }
}
