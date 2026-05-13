
export interface ImageLocationStamp {
    capturedAt: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
}

interface CompressImageOptions {
    locationStamp?: ImageLocationStamp;
}

const formatStampDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('pt-BR');
};

const drawLocationStamp = (
    ctx: CanvasRenderingContext2D,
    width: number,
    imageHeight: number,
    stamp: ImageLocationStamp
) => {
    const fontSize = Math.max(16, Math.min(26, Math.round(width * 0.022)));
    const padding = Math.round(fontSize * 0.75);
    const lineHeight = Math.round(fontSize * 1.35);
    const stampHeight = (lineHeight * 2) + (padding * 2);
    const top = imageHeight;

    const hasCoordinates = typeof stamp.latitude === 'number' && typeof stamp.longitude === 'number';
    const firstLine = hasCoordinates
        ? `Lat: ${stamp.latitude!.toFixed(6)} | Lon: ${stamp.longitude!.toFixed(6)}`
        : 'Coordenadas GPS nao informadas';
    const accuracyText = typeof stamp.accuracy === 'number'
        ? ` | Precisao: ${Math.round(stamp.accuracy)} m`
        : '';
    const secondLine = `Data: ${formatStampDate(stamp.capturedAt)}${accuracyText}`;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fillRect(0, top, width, stampHeight);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${fontSize}px Arial, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(firstLine, padding, top + padding);
    ctx.font = `600 ${Math.max(14, fontSize - 3)}px Arial, sans-serif`;
    ctx.fillText(secondLine, padding, top + padding + lineHeight);
};

/**
 * Comprime uma imagem para garantir tamanho reduzido.
 * @param file Arquivo de imagem original
 * @returns Promise com o Blob da imagem comprimida
 */
export const compressImage = async (file: File, options: CompressImageOptions = {}): Promise<Blob> => {
    const maxSizeKB = options.locationStamp ? 160 : 100;
    const maxWidth = 1200; // Redimensionar se for muito grande
    const qualityStep = 0.1;
    let quality = 0.9;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Redimensionar mantendo proporção
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                const stamp = options.locationStamp;
                const stampHeight = stamp
                    ? (Math.round(Math.max(16, Math.min(26, Math.round(width * 0.022))) * 1.35) * 2)
                    + (Math.round(Math.max(16, Math.min(26, Math.round(width * 0.022))) * 0.75) * 2)
                    : 0;

                canvas.width = width;
                canvas.height = height + stampHeight;

                const ctx = canvas.getContext('2d');
                if (!ctx) return reject('Canvas context error');
                ctx.drawImage(img, 0, 0, width, height);
                if (stamp) drawLocationStamp(ctx, width, height, stamp);

                const tryCompress = (q: number) => {
                    canvas.toBlob(
                        (blob) => {
                            if (!blob) return reject('Compression error');
                            if (blob.size / 1024 < maxSizeKB || q <= 0.1) {
                                resolve(blob);
                            } else {
                                tryCompress(q - qualityStep); // Reduz qualidade recursivamente
                            }
                        },
                        'image/jpeg',
                        q
                    );
                };

                tryCompress(quality);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};
