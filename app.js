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
    // 1. Příprava nastavení (Rozlišení a FPS)
    const [width, height] = resolutionSelect.value.split('x').map(Number);
    const fps = parseInt(fpsSelect.value, 10);
    
    // Nastavíme rozměry našeho skrytého plátna
    canvas.width = width;
    canvas.height = height;

    // Schováme nastavení a ukážeme ukazatel průběhu (Progress bar)
    startBtn.disabled = true;
    imageInput.disabled = true;
    progressContainer.style.display = 'block';
    progressBar.value = 0;
    progressBar.max = selectedFiles.length;

    try {
        // Použití stažené knihovny přes globální objekt Mp4Muxer
        const { Muxer, ArrayBufferTarget } = Mp4Muxer;

        // 2. Inicializace Muxeru (baliče do formátu MP4)
        let muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
                codec: 'avc', // Standardní kodek H.264, který přehraje každý iPhone
                width: width,
                height: height
            },
            fastStart: 'in-memory'
        });

        // 3. Inicializace VideoEncoderu (přístup k hardwaru iPhonu)
        let encoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: (e) => console.error("Chyba enkodéru:", e)
        });

        // Konfigurace enkodéru podle zvoleného rozlišení
        encoder.configure({
            codec: 'avc1.4d002a', // Profil pro H.264 video
            width: width,
            height: height,
            bitrate: width === 2560 ? 15000000 : 8000000, // Vyšší bitrate pro 2K rozlišení
            avc: { format: 'annexb' }
        });

        // 4. Cyklus, který zpracuje fotky JEDNU PO DRUHÉ (šetří paměť RAM)
        for (let i = 0; i < selectedFiles.length; i++) {
            statusText.textContent = `Zpracovávám snímek ${i + 1} z ${selectedFiles.length}...`;
            progressBar.value = i + 1;

            const file = selectedFiles[i];
            
            // Načtení obrázku do paměti super-rychlou cestou přes ImageBitmap
            const bitmap = await createImageBitmap(file);

            // Výpočet ořezu z poměru 4:3 na filmových 16:9 (středový ořez)
            const sWidth = bitmap.width;
            const sHeight = bitmap.width * (9 / 16);
            const sx = 0;
            const sy = (bitmap.height - sHeight) / 2;

            // Vykreslení oříznutého obrázku na plátno o správné velikosti
            ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, width, height);
            
            // Smazání bitmapy z paměti, už ji nepotřebujeme
            bitmap.close();

            // Určení času snímku ve videu (na základě zvoleného FPS)
            const timestampUs = (i * 1000000) / fps;

            // Vytvoření VideoFrame z canvasu a odeslání do procesoru
            let frame = new VideoFrame(canvas, { timestamp: timestampUs });
            
            // Přinutíme enkodér každých 30 snímků udělat klíčový snímek (Key Frame) pro plynulé video
            const insertKeyframe = (i % 30 === 0);
            encoder.encode(frame, { keyFrame: insertKeyframe });
            
            // Smazání rámečku z paměti (klíčové pro iOS, aby aplikace nespadla)
            frame.close();

            // Krátká pauza pro prohlížeč, aby stihl uvolnit paměť a nezasekl se
            await new Promise(r => setTimeout(r, 5));
        }

        // 5. Dokončení kódování
        statusText.textContent = "Dokončuji soubor videa...";
        await encoder.flush();
        muxer.finalize();

        // 6. Stažení hotového videa do iPhonu
        let { buffer } = muxer.target;
        let videoBlob = new Blob([buffer], { type: 'video/mp4' });
        let videoUrl = URL.createObjectURL(videoBlob);

        // Vytvoření neviditelného odkazu pro stažení
        let downloadLink = document.createElement('a');
        downloadLink.href = videoUrl;
        downloadLink.download = `timelapse_${width}p_${fps}fps.mp4`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        statusText.textContent = "✅ Video úspěšně vytvořeno a staženo!";

    } catch (error) {
        console.error(error);
        statusText.textContent = "❌ Během vytváření videa došlo k chybě.";
    } finally {
        // Vrátíme tlačítka do původního stavu
        startBtn.disabled = false;
        imageInput.disabled = false;
    }
});