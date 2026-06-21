// Propojení prvků z HTML stránky do JavaScriptu
const imageInput = document.getElementById('imageInput');
const fileCount = document.getElementById('fileCount');
const resolutionSelect = document.getElementById('resolutionSelect');
const fpsSelect = document.getElementById('fpsSelect');
const startBtn = document.getElementById('startBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const canvas = document.getElementById('videoCanvas');
const ctx = canvas.getContext('2d');

let selectedFiles = [];

// Hlídání, zda uživatel vybral nějaké fotky
imageInput.addEventListener('change', (e) => {
    selectedFiles = Array.from(e.target.files);
    fileCount.textContent = `Vybráno souborů: ${selectedFiles.length}`;
    
    // Pokud vybral alespoň 1 fotku, odemkneme tlačítko "Vytvořit"
    if (selectedFiles.length > 0) {
        startBtn.disabled = false;
    } else {
        startBtn.disabled = true;
    }
});

// Hlavní funkce, která se spustí po kliknutí na tlačítko "Vytvořit timelapse"
startBtn.addEventListener('click', async () => {
    const [width, height] = resolutionSelect.value.split('x').map(Number);
    const fps = parseInt(fpsSelect.value, 10);
    
    canvas.width = width;
    canvas.height = height;

    startBtn.disabled = true;
    imageInput.disabled = true;
    progressContainer.style.display = 'block';
    progressBar.value = 0;
    progressBar.max = selectedFiles.length;

    // Pomocná proměnná, abychom v chybě věděli, u které fotky to kleklo
    let currentProcessingIndex = 0;

    try {
        const { Muxer, ArrayBufferTarget } = Mp4Muxer;

        let muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
                codec: 'avc',
                width: width,
                height: height
            },
            fastStart: 'in-memory'
        });

        let encoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: (e) => {
                throw new Error(`Chyba VideoEncoderu: ${e.message || e}`);
            }
        });

        encoder.configure({
            codec: 'avc1.4d002a',
            width: width,
            height: height,
            bitrate: width === 2560 ? 12000000 : 6000000, // Snížený bitrate pro lepší stabilitu na iOS
            avc: { format: 'annexb' }
        });

        for (let i = 0; i < selectedFiles.length; i++) {
            currentProcessingIndex = i + 1;
            statusText.textContent = `Zpracovávám snímek ${currentProcessingIndex} z ${selectedFiles.length}...`;
            progressBar.value = currentProcessingIndex;

            const file = selectedFiles[i];
            
            // Načtení obrázku s ošetřením chyb
            let bitmap;
            try {
                bitmap = await createImageBitmap(file);
            } catch (imgError) {
                throw new Error(`Nelze načíst foto č. ${currentProcessingIndex} (${file.name}). Formát není podporován (např. HEIC) nebo je soubor příliš velký. Kód: ${imgError.message}`);
            }

            const sWidth = bitmap.width;
            const sHeight = bitmap.width * (9 / 16);
            const sx = 0;
            const sy = (bitmap.height - sHeight) / 2;

            ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, width, height);
            bitmap.close();

            const timestampUs = (i * 1000000) / fps;
            let frame = new VideoFrame(canvas, { timestamp: timestampUs });
            
            const insertKeyframe = (i % 30 === 0);
            encoder.encode(frame, { keyFrame: insertKeyframe });
            frame.close();

            // Delší pauza (15ms) uvolní paměť iPhonu a zabrání pádům Safari
            await new Promise(r => setTimeout(r, 15));
        }

        statusText.textContent = "Dokončuji soubor videa...";
        await encoder.flush();
        muxer.finalize();

        let { buffer } = muxer.target;
        let videoBlob = new Blob([buffer], { type: 'video/mp4' });
        let videoUrl = URL.createObjectURL(videoBlob);

        let downloadLink = document.createElement('a');
        downloadLink.href = videoUrl;
        downloadLink.download = `timelapse_${width}p_${fps}fps.mp4`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        statusText.textContent = "✅ Video úspěšně vytvořeno a staženo!";

    } catch (error) {
        console.error(error);
        // Tady se nám teď vypíše přesný důvod, proč aplikace selhala
        statusText.textContent = `❌ Chyba (Snímek ${currentProcessingIndex}): ${error.message}`;
    } finally {
        startBtn.disabled = false;
        imageInput.disabled = false;
    }
});
