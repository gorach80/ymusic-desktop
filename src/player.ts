import { getConfig, saveConfig } from "./services/config";
import { listen } from "@tauri-apps/api/event";
import { searchTracks, Track } from "./services/music";

const audio = new Audio();
const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
const muteBtn = document.getElementById("muteBtn") as HTMLButtonElement;
const volumeSlider = document.getElementById("volumeSlider") as HTMLInputElement;
const trackTitle = document.getElementById("trackTitle") as HTMLHeadingElement;
const trackArtist = document.getElementById("trackArtist") as HTMLParagraphElement;
const searchInput = document.getElementById("searchInput") as HTMLInputElement;
const resultsList = document.getElementById("resultsList") as HTMLDivElement;

let currentTrack: Track | null = null;

export async function playTrack(track: Track) {
  currentTrack = track;
  audio.src = track.url;
  trackTitle.textContent = track.title;
  trackArtist.textContent = track.artist;
  
  audio.play().catch(console.error);
  playBtn.textContent = "Pausar";
}

async function initPlayer() {
  const config = await getConfig();
  if (config.theme === "dark") {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }
  
  audio.volume = config.muted ? 0 : config.volume;
  volumeSlider.value = (config.volume * 100).toString();
  muteBtn.textContent = config.muted ? "Activar" : "Silenciar";
  audio.src = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
}

playBtn.addEventListener("click", () => {
  if (audio.paused) {
    audio.play().catch(console.error);
    playBtn.textContent = "Pausar";
  } else {
    audio.pause();
    playBtn.textContent = "Reproducir";
  }
});

volumeSlider.addEventListener("input", async () => {
  const vol = parseFloat(volumeSlider.value) / 100;
  audio.volume = vol;
  
  const config = await getConfig();
  config.volume = vol;
  config.muted = vol === 0;
  muteBtn.textContent = config.muted ? "Activar" : "Silenciar";
  await saveConfig(config);
});

muteBtn.addEventListener("click", async () => {
  const config = await getConfig();
  config.muted = !config.muted;
  audio.volume = config.muted ? 0 : config.volume;
  muteBtn.textContent = config.muted ? "Activar" : "Silenciar";
  await saveConfig(config);
});

initPlayer();

// Listen to global shortcuts from Rust
try {
  listen("shortcut-play-pause", () => {
    playBtn.click();
  });
  listen("shortcut-mute", () => {
    muteBtn.click();
  });
} catch (error) {
  console.warn("No se pudieron registrar los oyentes de eventos de Tauri:", error);
}

// Render search results list
function renderResults(tracks: Track[]) {
  resultsList.innerHTML = "";
  tracks.forEach(track => {
    const item = document.createElement("div");
    item.className = "result-item";
    
    const info = document.createElement("div");
    info.className = "result-info";
    
    const titleEl = document.createElement("span");
    titleEl.className = "result-title";
    titleEl.textContent = track.title;
    
    const artistEl = document.createElement("span");
    artistEl.className = "result-artist";
    artistEl.textContent = track.artist;
    
    info.appendChild(titleEl);
    info.appendChild(artistEl);
    item.appendChild(info);
    
    item.addEventListener("click", () => {
      playTrack(track);
    });
    
    resultsList.appendChild(item);
  });
}

// Search input keydown listener (Enter trigger)
searchInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    const query = searchInput.value.trim();
    if (query) {
      searchInput.disabled = true;
      searchInput.placeholder = "Buscando...";
      try {
        const results = await searchTracks(query);
        renderResults(results);
      } catch (err) {
        console.error("Error al buscar:", err);
      } finally {
        searchInput.disabled = false;
        searchInput.placeholder = "Buscar música...";
        searchInput.focus();
      }
    }
  }
});

// Expose global search helper for dev testing
(window as any).performSearch = async (query: string) => {
  console.log(`Buscando en Deezer: ${query}`);
  const results = await searchTracks(query);
  console.log("Resultados de búsqueda:", results);
  renderResults(results);
  if (results.length > 0) {
    console.log(`Reproduciendo primer resultado: ${results[0].title} - ${results[0].artist}`);
    playTrack(results[0]);
  } else {
    console.warn("No se obtuvieron resultados de la búsqueda.");
  }
};
