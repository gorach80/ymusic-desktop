import { getConfig, saveConfig } from "./services/config";
import { listen } from "@tauri-apps/api/event";
import { searchTracks, Track } from "./services/music";
import { getSemanticQuery } from "./services/gemini";
import { saveGDriveToken, getGDriveToken, clearGDriveToken, listGDriveMusic, fetchGDriveLyrics } from "./services/gdrive";

// Native HTML5 Audio
const audio = new Audio();

// State
let currentConfig = { theme: 'dark', volume: 0.8, muted: false };
let playQueue: Track[] = [];
let queueIndex = -1;

// DOM Elements
const searchInput = document.getElementById("searchInput") as HTMLInputElement;
const resultsGrid = document.getElementById("resultsGrid") as HTMLDivElement;
const trackTitle = document.getElementById("trackTitle") as HTMLHeadingElement;
const trackArtist = document.getElementById("trackArtist") as HTMLParagraphElement;
const albumArtDisc = document.getElementById("albumArtDisc") as HTMLDivElement;

const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
const prevBtn = document.getElementById("prevBtn") as HTMLButtonElement;
const nextBtn = document.getElementById("nextBtn") as HTMLButtonElement;
const muteBtn = document.getElementById("muteBtn") as HTMLButtonElement;

const progressBar = document.getElementById("progressBar") as HTMLInputElement;
const volumeSlider = document.getElementById("volumeSlider") as HTMLInputElement;
const currentTimeLabel = document.getElementById("currentTime") as HTMLSpanElement;
const totalDurationLabel = document.getElementById("totalDuration") as HTMLSpanElement;
const resultsTitle = document.querySelector(".section-title") as HTMLHeadingElement;

const queueList = document.getElementById("queueList") as HTMLDivElement;
const lyricsView = document.getElementById("lyricsView") as HTMLDivElement;

const btnLibrary = document.getElementById("btnLibrary") as HTMLAnchorElement;
const btnGDrive = document.getElementById("btnGDrive") as HTMLAnchorElement;

/* Helper: Format Time */
function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/* UI Redraw: Queue */
function renderQueue() {
  if (playQueue.length === 0) {
    queueList.innerHTML = `<div class="queue-empty">Cola vacía</div>`;
    return;
  }
  
  queueList.innerHTML = "";
  playQueue.forEach((track, index) => {
    const item = document.createElement("div");
    item.className = `queue-item ${index === queueIndex ? 'active' : ''}`;
    if (index === queueIndex) {
      item.style.backgroundColor = "var(--active-bg)";
      item.style.borderLeft = "3px solid var(--accent)";
    }
    
    const info = document.createElement("div");
    info.style.overflow = "hidden";
    
    const titleEl = document.createElement("h4");
    titleEl.className = "queue-item-title";
    titleEl.textContent = track.title;
    
    const artistEl = document.createElement("p");
    artistEl.className = "queue-item-artist";
    artistEl.textContent = track.artist;
    
    info.appendChild(titleEl);
    info.appendChild(artistEl);
    item.appendChild(info);
    
    item.addEventListener("click", () => {
      playQueueTrack(index);
    });
    
    queueList.appendChild(item);
  });
}

/* UI Redraw: Search Results Grid */
function renderResults(tracks: Track[]) {
  resultsGrid.innerHTML = "";
  if (tracks.length === 0) {
    resultsGrid.innerHTML = `<div class="grid-placeholder">No se encontraron resultados</div>`;
    return;
  }
  
  tracks.forEach(track => {
    const card = document.createElement("div");
    card.className = "track-card";
    
    const art = document.createElement("div");
    art.className = "card-art";
    art.textContent = track.title.substring(0, 1).toUpperCase();
    
    const title = document.createElement("h4");
    title.className = "card-title";
    title.textContent = track.title;
    
    const artist = document.createElement("p");
    artist.className = "card-artist";
    artist.textContent = track.artist;
    
    card.appendChild(art);
    card.appendChild(title);
    card.appendChild(artist);
    
    card.addEventListener("click", () => {
      // Set queue to search results starting from this track
      playQueue = [track];
      // Append others to queue
      tracks.forEach(t => {
        if (t.id !== track.id) {
          playQueue.push(t);
        }
      });
      queueIndex = 0;
      playQueueTrack(queueIndex);
    });
    
    resultsGrid.appendChild(card);
  });
}

/* Load & Play Queue Track */
function playQueueTrack(index: number) {
  if (index < 0 || index >= playQueue.length) return;
  queueIndex = index;
  const track = playQueue[index];
  
  // Set source & text details
  audio.src = track.url;
  trackTitle.textContent = track.title;
  trackArtist.textContent = track.artist;
  
  audio.play()
    .then(() => {
      playBtn.textContent = "Pausar";
      albumArtDisc.classList.add("playing");
    })
    .catch(console.error);
    
  renderQueue();
  loadLyricsAsync(track);
}

/* Lyrics Loader Engine (Async Mock + Google Drive text file support) */
async function loadLyricsAsync(track: Track) {
  lyricsView.innerHTML = `<div class="lyrics-line">Cargando letras...</div>`;
  
  if (track.id.startsWith("gdrive-") && track.folderId) {
    try {
      const gdriveLyrics = await fetchGDriveLyrics(track.folderId);
      if (gdriveLyrics) {
        lyricsView.innerHTML = "";
        const lines = gdriveLyrics.split(/\r?\n/);
        lines.forEach((line) => {
          const trimmed = line.trim();
          if (trimmed) {
            const p = document.createElement("p");
            p.className = "lyrics-line";
            p.textContent = trimmed;
            lyricsView.appendChild(p);
          }
        });
        return;
      }
    } catch (e) {
      console.warn("No se pudo cargar la letra desde el archivo de Google Drive:", e);
    }
  }

  // Simulate network request to lyrics provider
  setTimeout(() => {
    const mockLyrics = [
      `[Instrumento Intro]`,
      `Esta es la canción: ${track.title}`,
      `Interpretada con pasión por: ${track.artist}`,
      `Siente la vibración en tu sistema`,
      `El buffer adaptativo de 16s evita cortes`,
      `[Solo Instrumental]`,
      `Disfruta el audio ligero de yMusic`,
      `[Fin de reproducción]`
    ];
    
    lyricsView.innerHTML = "";
    mockLyrics.forEach((line, idx) => {
      const p = document.createElement("p");
      p.className = `lyrics-line ${idx === 1 ? 'active' : ''}`;
      p.textContent = line;
      lyricsView.appendChild(p);
    });
  }, 1200);
}

/* Audio Buffer Metrics Monitor (Adaptive Buffering) */
function monitorBuffer() {
  audio.addEventListener("progress", () => {
    if (audio.duration > 0 && audio.buffered.length > 0) {
      const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
      const duration = audio.duration;
      const percentBuffered = (bufferedEnd / duration) * 100;
      
      // Calculate buffer size in seconds from current time
      const bufferSeconds = Math.max(0, bufferedEnd - audio.currentTime);
      console.log(`[Buffer Monitor] Segundos en Buffer: ${bufferSeconds.toFixed(1)}s (${percentBuffered.toFixed(1)}% cargado)`);
    }
  });

  audio.addEventListener("waiting", () => {
    console.warn("[Buffer Monitor] Conexión inestable. Esperando carga de audio...");
    lyricsView.insertAdjacentHTML('afterbegin', `<div class="lyrics-line" style="color: var(--accent);">[Cargando Buffer...]</div>`);
  });
}

/* Initialize Player Preferences */
async function initPlayer() {
  try {
    currentConfig = await getConfig();
    if (currentConfig.theme === "dark") {
      document.body.classList.remove("light-theme");
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
      document.body.classList.add("light-theme");
    }
    
    audio.volume = currentConfig.muted ? 0 : currentConfig.volume;
    volumeSlider.value = (currentConfig.volume * 100).toString();
    muteBtn.textContent = currentConfig.muted ? "Activar" : "Silenciar";
  } catch (error) {
    console.warn("Error cargando configuración. Usando valores locales por defecto.", error);
  }
  
  // Set default audio track
  audio.src = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
  monitorBuffer();
}

/* Bind UI Event Listeners */

// Play/Pause Action
playBtn.addEventListener("click", () => {
  if (audio.paused) {
    audio.play().catch(console.error);
    playBtn.textContent = "Pausar";
    albumArtDisc.classList.add("playing");
  } else {
    audio.pause();
    playBtn.textContent = "Reproducir";
    albumArtDisc.classList.remove("playing");
  }
});

// Next Track Action
nextBtn.addEventListener("click", () => {
  if (playQueue.length > 0) {
    let nextIndex = queueIndex + 1;
    if (nextIndex >= playQueue.length) nextIndex = 0; // Loop back
    playQueueTrack(nextIndex);
  }
});

// Previous Track Action
prevBtn.addEventListener("click", () => {
  if (playQueue.length > 0) {
    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) prevIndex = playQueue.length - 1; // Loop back to end
    playQueueTrack(prevIndex);
  }
});

// Mute Toggle Action
muteBtn.addEventListener("click", async () => {
  try {
    const config = await getConfig();
    config.muted = !config.muted;
    audio.volume = config.muted ? 0 : config.volume;
    muteBtn.textContent = config.muted ? "Activar" : "Silenciar";
    await saveConfig(config);
  } catch (_) {
    // Local fallback
    currentConfig.muted = !currentConfig.muted;
    audio.volume = currentConfig.muted ? 0 : currentConfig.volume;
    muteBtn.textContent = currentConfig.muted ? "Activar" : "Silenciar";
  }
});

// Volume Bar Drag
volumeSlider.addEventListener("input", async () => {
  const vol = parseFloat(volumeSlider.value) / 100;
  audio.volume = vol;
  
  try {
    const config = await getConfig();
    config.volume = vol;
    config.muted = vol === 0;
    muteBtn.textContent = config.muted ? "Activar" : "Silenciar";
    await saveConfig(config);
  } catch (_) {
    // Local fallback
    currentConfig.volume = vol;
    currentConfig.muted = vol === 0;
    muteBtn.textContent = currentConfig.muted ? "Activar" : "Silenciar";
  }
});

// Progress Bar update
audio.addEventListener("timeupdate", () => {
  if (audio.duration) {
    const percentage = (audio.currentTime / audio.duration) * 100;
    progressBar.value = percentage.toString();
    currentTimeLabel.textContent = formatTime(audio.currentTime);
  }
});

audio.addEventListener("loadedmetadata", () => {
  totalDurationLabel.textContent = formatTime(audio.duration);
});

progressBar.addEventListener("change", () => {
  if (audio.duration) {
    const newTime = (parseFloat(progressBar.value) / 100) * audio.duration;
    audio.currentTime = newTime;
  }
});

// Search trigger on Enter with Gemini Semantic Intelligence
searchInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    const query = searchInput.value.trim();
    if (query) {
      searchInput.disabled = true;
      searchInput.placeholder = "Consultando a Gemini...";
      try {
        // 1. Get structured semantic search params from Google AI Studio (Gemini)
        const semantic = await getSemanticQuery(query);
        
        if (semantic) {
          console.log(`[Gemini AI] Búsqueda optimizada: "${semantic.searchQuery}" (Clima: ${semantic.detectedMood} | Géneros: ${semantic.genres.join(", ")})`);
          resultsTitle.textContent = `Resultados de Búsqueda (Clima: ${semantic.detectedMood} | Géneros: ${semantic.genres.join(", ")})`;
          
          // 2. Fetch actual tracks from Deezer
          searchInput.placeholder = "Buscando canciones...";
          const results = await searchTracks(semantic.searchQuery);
          renderResults(results);
        } else {
          // Fallback directly to normal search
          resultsTitle.textContent = "Resultados de Búsqueda";
          const results = await searchTracks(query);
          renderResults(results);
        }
      } catch (err) {
        console.error("Error en flujo de búsqueda semántica:", err);
      } finally {
        searchInput.disabled = false;
        searchInput.placeholder = "Buscar canciones, artistas, álbumes...";
        searchInput.focus();
      }
    }
  }
});

// Listen to global shortcuts emitted by Rust backend
try {
  listen("shortcut-play-pause", () => {
    console.log("[Shortcut] Play/Pause trigger");
    playBtn.click();
  });
  listen("shortcut-mute", () => {
    console.log("[Shortcut] Mute trigger");
    muteBtn.click();
  });
} catch (error) {
  console.warn("Atajos de Tauri no disponibles en navegador estándar.", error);
}

// Expose global search helper for dev testing
(window as any).performSearch = async (query: string) => {
  console.log(`Buscando en Deezer: ${query}`);
  const results = await searchTracks(query);
  console.log("Resultados de búsqueda:", results);
  renderResults(results);
  if (results.length > 0) {
    console.log(`Reproduciendo primer resultado: ${results[0].title} - ${results[0].artist}`);
    playQueue = results;
    queueIndex = 0;
    playQueueTrack(queueIndex);
  } else {
    console.warn("No se obtuvieron resultados de la búsqueda.");
  }
};

/* Google Drive Music Loading and UI Integration */
async function loadGDriveMusic() {
  resultsGrid.innerHTML = `<div class="grid-placeholder">Cargando música de Google Drive...</div>`;
  resultsTitle.textContent = "Resultados de Búsqueda (Google Drive - MUSICA)";
  
  try {
    const tracks = await listGDriveMusic();
    if (tracks === null) {
      showGDriveConnectionForm("Tu token de acceso ha expirado o es inválido. Por favor, ingresa uno nuevo para continuar.");
      return;
    }
    
    if (tracks.length === 0) {
      resultsGrid.innerHTML = `
        <div class="grid-placeholder">
          No se encontraron archivos de audio en la carpeta "MUSICA".
          <br><br>
          <button class="gdrive-btn secondary" id="btnDisconnectGDrive">Desconectar Google Drive</button>
        </div>
      `;
      document.getElementById("btnDisconnectGDrive")?.addEventListener("click", () => {
        clearGDriveToken();
        showGDriveConnectionForm();
      });
      return;
    }
    
    renderResults(tracks);
    
    const disconnectHeader = document.createElement("div");
    disconnectHeader.style.gridColumn = "1 / -1";
    disconnectHeader.style.display = "flex";
    disconnectHeader.style.justifyContent = "flex-end";
    disconnectHeader.style.padding = "10px 0";
    
    const discBtn = document.createElement("button");
    discBtn.className = "gdrive-btn secondary";
    discBtn.style.padding = "6px 12px";
    discBtn.style.fontSize = "0.75rem";
    discBtn.textContent = "Desconectar Google Drive";
    discBtn.addEventListener("click", () => {
      clearGDriveToken();
      showGDriveConnectionForm();
    });
    
    disconnectHeader.appendChild(discBtn);
    resultsGrid.insertBefore(disconnectHeader, resultsGrid.firstChild);
    
  } catch (error) {
    resultsGrid.innerHTML = `<div class="grid-placeholder" style="color: var(--accent);">Error al cargar música de Google Drive: ${(error as Error).message}</div>`;
  }
}

function showGDriveConnectionForm(errorMessage?: string) {
  resultsTitle.textContent = "Conectar Google Drive";
  resultsGrid.innerHTML = `
    <div class="gdrive-connect-container">
      <h4>Acceso a tu Carpeta "MUSICA"</h4>
      <p>
        Para reproducir archivos de audio de tu Google Drive, ingresa un Token de Acceso temporal.
      </p>
      ${errorMessage ? `<p style="color: var(--accent); font-weight: bold;">${errorMessage}</p>` : ""}
      
      <input type="password" id="gdriveTokenInput" class="gdrive-connect-input" placeholder="Pega tu Access Token de Google aquí...">
      
      <button class="gdrive-btn" id="btnSaveGDriveToken">Guardar y Conectar</button>
      
      <p style="font-size: 0.75rem; margin-top: 10px;">
        ¿Cómo obtener un token? Puedes conseguir uno rápidamente seleccionando "Drive API v3" y autorizando la lectura en el 
        <a href="https://developers.google.com/oauthplayground/" target="_blank" style="color: var(--accent);">Google OAuth Playground</a>.
      </p>
    </div>
  `;
  
  document.getElementById("btnSaveGDriveToken")?.addEventListener("click", () => {
    const input = document.getElementById("gdriveTokenInput") as HTMLInputElement;
    const token = input.value.trim();
    if (token) {
      saveGDriveToken(token);
      loadGDriveMusic();
    } else {
      alert("Por favor ingresa un token válido.");
    }
  });
}

// Navigation Listeners
btnLibrary.addEventListener("click", (e) => {
  e.preventDefault();
  btnGDrive.classList.remove("active");
  btnLibrary.classList.add("active");
  resultsTitle.textContent = "Resultados de Búsqueda";
  resultsGrid.innerHTML = `
    <div class="grid-placeholder">
      Escribe una canción o un tema de tu preferencia y presiona Enter...
    </div>
  `;
});

btnGDrive.addEventListener("click", (e) => {
  e.preventDefault();
  btnLibrary.classList.remove("active");
  btnGDrive.classList.add("active");
  
  const token = getGDriveToken();
  if (token) {
    loadGDriveMusic();
  } else {
    showGDriveConnectionForm();
  }
});

// Initialize Player on startup
initPlayer();
