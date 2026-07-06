import { getConfig, saveConfig } from "./services/config";

const audio = new Audio();
const playBtn = document.getElementById("playBtn") as HTMLButtonElement;
const muteBtn = document.getElementById("muteBtn") as HTMLButtonElement;
const volumeSlider = document.getElementById("volumeSlider") as HTMLInputElement;

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
