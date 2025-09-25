let currentCharacterFrames = { neutral: null, talking: null };
let uploadedNeutralDataUrl = null; // new: store uploaded start frame
let isGenerating = false;
let isSpeaking = false;
let talkInterval = null;

const characterImg = document.getElementById('character');
const mouthOverlay = document.getElementById('mouthOverlay');
const textInput = document.getElementById('textInput');
const speakInput = document.getElementById('speakInput');
const generateBtn = document.getElementById('generateBtn');
const speakBtn = document.getElementById('speakBtn');
const status = document.getElementById('status');
const uploadInput = document.getElementById('uploadInput');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingMessage = document.getElementById('loadingMessage');
const galleryList = document.getElementById('galleryList');
const galleryFilter = document.getElementById('galleryFilter');
const gallerySort = document.getElementById('gallerySort');

function showLoading(message = 'Loading...') {
    if (loadingOverlay) {
        loadingMessage.textContent = message;
        loadingOverlay.setAttribute('aria-hidden', 'false');
    }
}

function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.setAttribute('aria-hidden', 'true');
    }
}

function loadGallery() {
    const raw = localStorage.getItem('aiGallery');
    return raw ? JSON.parse(raw) : [];
}

function saveGallery(items) {
    localStorage.setItem('aiGallery', JSON.stringify(items));
}

function renderGallery() {
    const q = (galleryFilter.value || '').toLowerCase();
    const items = loadGallery().slice().sort((a,b) => gallerySort.value==='new' ? b.ts - a.ts : a.ts - b.ts);
    galleryList.innerHTML = '';
    items.filter(it => {
        if (!q || q==='all') return true;
        if (q==='images') return !!it.neutral;
        if (q==='spoken') return !!it.spokenText;
        return (it.title && it.title.toLowerCase().includes(q)) || (it.spokenText && it.spokenText.toLowerCase().includes(q));
    }).forEach(it => {
        const el = document.createElement('div');
        el.className = 'gallery-item';
        el.dataset.id = it.id;
        el.innerHTML = `<img src="${it.neutral || it.talking || ''}" alt=""><div class="meta">${it.spokenText ? 'Spoken' : 'Image'}</div>`;
        el.addEventListener('click', () => loadGalleryItem(it.id));
        galleryList.appendChild(el);
    });
}

function addGalleryEntry(entry) {
    const items = loadGallery();
    items.push({ id: Date.now().toString(), ts: Date.now(), ...entry });
    saveGallery(items);
    renderGallery();
}

function loadGalleryItem(id) {
    const items = loadGallery();
    const it = items.find(x => x.id === id);
    if (!it) return;
    if (it.neutral) {
        currentCharacterFrames.neutral = it.neutral;
        characterImg.src = it.neutral;
    }
    if (it.talking) currentCharacterFrames.talking = it.talking;
    if (it.spokenText) speakInput.value = it.spokenText;
    status.textContent = 'Loaded item from gallery.';
}

generateBtn.addEventListener('click', async () => {
    if (isGenerating) return;
    const promptText = textInput.value.trim();
    if (!promptText) {
        status.textContent = 'Please enter a prompt to generate the character.';
        return;
    }
    isGenerating = true;
    generateBtn.disabled = true;
    showLoading('Generating base character and talking frame...');
    status.textContent = 'Generating base character and talking frame...';
    try {
        // Generate base (neutral) frame
        const result1 = await websim.imageGen({
            prompt: promptText,
            width: 512,
            height: 512
        });
        currentCharacterFrames.neutral = result1.url;
        characterImg.src = currentCharacterFrames.neutral;

        // Prepare base64 for next generation
        let base64;
        if (result1.url.startsWith('data:')) {
            base64 = result1.url;
        } else {
            const response = await fetch(result1.url);
            const blob = await response.blob();
            base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        }

        // Generate talking frame automatically
        const result2 = await websim.imageGen({
            prompt: "Make this character's mouth open as if talking or speaking, keep the same art style and colors",
            image_inputs: [{ url: base64 }],
            width: 512,
            height: 512
        });
        currentCharacterFrames.talking = result2.url;

        // save base+talking to gallery
        addGalleryEntry({ title: promptText, neutral: currentCharacterFrames.neutral, talking: currentCharacterFrames.talking });

        status.textContent = 'Character generated with 2 frames! Enter text to speak.';
        hideLoading();
        textInput.value = '';
        // ensure speak input is focused for speaking
        speakInput.placeholder = 'Enter text to speak...';
        speakInput.value = '';
        speakBtn.disabled = false;
    } catch (error) {
        console.error('Error generating character:', error);
        status.textContent = 'Error generating character or talking frame. Please try again.';
        hideLoading();
    } finally {
        isGenerating = false;
        generateBtn.disabled = false;
    }
});

uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files && uploadInput.files[0];
    if (!file) {
        status.textContent = 'Please choose an image file to upload first.';
        return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
        uploadedNeutralDataUrl = reader.result;
        currentCharacterFrames.neutral = uploadedNeutralDataUrl;
        characterImg.src = uploadedNeutralDataUrl;
        status.textContent = 'Uploaded image set; generating talking frame...';
        showLoading('Generating talking frame from uploaded image...');
        try {
            const base64 = uploadedNeutralDataUrl;
            const result2 = await websim.imageGen({
                prompt: "Make this character's mouth open as if talking or speaking, keep the same art style and colors",
                image_inputs: [{ url: base64 }],
                width: 512,
                height: 512
            });
            currentCharacterFrames.talking = result2.url;
            // save uploaded + talking to gallery
            addGalleryEntry({ title: file.name || 'Upload', neutral: uploadedNeutralDataUrl, talking: currentCharacterFrames.talking });
            status.textContent = 'Frames ready! Enter text and press Speak to animate.';
            hideLoading();
            speakInput.placeholder = 'Enter text to speak...';
            speakBtn.disabled = false;
        } catch (err) {
            console.error(err);
            status.textContent = 'Error generating talking frame from upload.';
            hideLoading();
        }
    };
    reader.readAsDataURL(file);
});

async function speakText() {
    const textToSpeak = speakInput.value.trim();
    if (isSpeaking || !textToSpeak) {
        if (!textToSpeak) status.textContent = 'Please enter text to speak.';
        return;
    }
    
    isSpeaking = true;
    speakBtn.disabled = true;
    const text = textToSpeak;
    
    try {
        // Generate speech
        status.textContent = 'Generating speech...';
        showLoading('Generating speech and playing audio...');
        const ttsResult = await websim.textToSpeech({
            text: text,
            voice: 'en-male'
        });
        
        // Create audio element
        const audio = new Audio(ttsResult.url);
        
        // hide loading UI before starting playback/animation
        hideLoading();
        
        // Start mouth animation by cycling frames
        let showTalking = true;
        characterImg.src = currentCharacterFrames.talking;
        talkInterval = setInterval(() => {
            characterImg.src = showTalking ? currentCharacterFrames.talking : currentCharacterFrames.neutral;
            showTalking = !showTalking;
        }, 200); // toggle every 200ms
        
        // Play audio
        audio.play();
        
        // save this spoken text linked to current frames
        addGalleryEntry({ title: 'Spoken - ' + text.slice(0,30), neutral: currentCharacterFrames.neutral, talking: currentCharacterFrames.talking, spokenText: text });
        
        // Update status
        status.textContent = 'Character is speaking...';
        
        // Stop animation when audio ends
        audio.addEventListener('ended', () => {
            clearInterval(talkInterval);
            talkInterval = null;
            characterImg.src = currentCharacterFrames.neutral;
            isSpeaking = false;
            speakBtn.disabled = false;
            status.textContent = 'Ready to speak again!';
            hideLoading();
        });
        
        // Handle audio errors
        audio.addEventListener('error', () => {
            if (talkInterval) { clearInterval(talkInterval); talkInterval = null; }
            characterImg.src = currentCharacterFrames.neutral;
            isSpeaking = false;
            speakBtn.disabled = false;
            status.textContent = 'Error playing audio. Please try again.';
            hideLoading();
        });
        
    } catch (error) {
        console.error('Error with TTS:', error);
        if (talkInterval) { clearInterval(talkInterval); talkInterval = null; }
        characterImg.src = currentCharacterFrames.neutral;
        isSpeaking = false;
        speakBtn.disabled = false;
        status.textContent = 'Error generating speech. Please try again.';
        hideLoading();
    }
}

// attach speak button and initialize UI state
speakBtn.addEventListener('click', speakText);

textInput.disabled = false; // allow entering prompt for generation initially
speakInput.disabled = false;
speakBtn.disabled = true;

/* initialize */
renderGallery();
galleryFilter.addEventListener('input', renderGallery);
gallerySort.addEventListener('change', renderGallery);