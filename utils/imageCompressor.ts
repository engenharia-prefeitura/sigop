
/**
 * Comprime uma imagem para garantir que ela tenha menos de 100kb
 * @param file Arquivo de imagem original
 * @returns Promise com o Blob da imagem comprimida
 */
export const compressImage = async (file: File): Promise<Blob> => {
    const maxSizeKB = 100;
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

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) return reject('Canvas context error');
                ctx.drawImage(img, 0, 0, width, height);

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
