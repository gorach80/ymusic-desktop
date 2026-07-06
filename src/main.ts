import { getConfig, saveConfig, UserConfig } from './services/config.ts';

// State management
let currentConfig: UserConfig = {
  theme: 'dark',
  volume: 0.8,
  muted: false
};

// DOM Elements
const bodyElement = document.body;
const playerCard = document.querySelector('.player-card') as HTMLElement;
const audioElement = document.getElementById('audio-element') as HTMLAudioElement;

const themeToggleBtn = document.getElementById('theme-toggle') as HTMLButtonElement;
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const prevBtn = document.getElementById('prev-btn') as HTMLButtonElement;
const nextBtn = document.getElementById('next-btn') as HTMLButtonElement;
const muteToggleBtn = document.getElementById('mute-toggle') as HTMLButtonElement;

const progressBar = document.getElementById('progress-bar') as HTMLInputElement;
const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
const volumeBar = document.getElementById('volume-bar') as HTMLInputElement;
const volumeFill = document.getElementById('volume-fill') as HTMLDivElement;

const currentTimeLabel = document.getElementById('current-time') as HTMLSpanElement;
const totalDurationLabel = document.getElementById('total-duration') as HTMLSpanElement;
const albumArtDisc = document.getElementById('album-art-disc') as HTMLDivElement;

/**
 * Format seconds to M:SS
 */
function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Update UI fills for sliders
 */
function updateVolumeSliderUI(val: number) {
  const percentage = val * 100;
  volumeFill.style.width = `${percentage}%`;
  volumeBar.value = val.toString();
}

function updateProgressSliderUI(currentTime: number, duration: number) {
  if (!duration) return;
  const percentage = (currentTime / duration) * 100;
  progressBar.value = percentage.toString();
  progressFill.style.width = `${percentage}%`;
}

/**
 * Apply configuration settings to UI & Native elements
 */
function applyConfiguration() {
  // 1. Theme Configuration
  if (currentConfig.theme === 'light') {
    bodyElement.classList.remove('dark-theme');
    bodyElement.classList.add('light-theme');
  } else {
    bodyElement.classList.remove('light-theme');
    bodyElement.classList.add('dark-theme');
  }

  // 2. Volume Configuration
  audioElement.volume = currentConfig.volume;
  updateVolumeSliderUI(currentConfig.volume);

  // 3. Muted Configuration
  audioElement.muted = currentConfig.muted;
  if (currentConfig.muted) {
    playerCard.classList.add('muted');
  } else {
    playerCard.classList.remove('muted');
  }
}

/**
 * Load settings from Tauri Rust backend or local fallback
 */
async function loadSettings() {
  try {
    console.log("Cargando configuración desde el backend de Rust...");
    currentConfig = await getConfig();
    console.log("Configuración cargada exitosamente:", currentConfig);
  } catch (error) {
    console.warn("No se pudo obtener la configuración de Rust. Usando valores predeterminados de localStorage o por defecto.", error);
    // Local storage fallback for web/dev testing
    const saved = localStorage.getItem('ymusic_config');
    if (saved) {
      try {
        currentConfig = JSON.parse(saved);
      } catch (_) {
        // use default if corrupted
      }
    }
  }
  applyConfiguration();
}

/**
 * Persist config to Rust or local fallback
 */
async function persistSettings() {
  try {
    await saveConfig(currentConfig);
    console.log("Configuración guardada en Rust:", currentConfig);
  } catch (error) {
    console.warn("No se pudo guardar la configuración en Rust. Guardando en localStorage.", error);
    localStorage.setItem('ymusic_config', JSON.stringify(currentConfig));
  }
}

/* Event Handlers */

// Play / Pause Toggle
function togglePlay() {
  if (audioElement.paused) {
    audioElement.play()
      .then(() => {
        playerCard.classList.add('playing');
      })
      .catch(err => console.error("Error al reproducir audio:", err));
  } else {
    audioElement.pause();
    playerCard.classList.remove('playing');
  }
}

// Theme Toggle
async function toggleTheme() {
  const newTheme = currentConfig.theme === 'dark' ? 'light' : 'dark';
  currentConfig.theme = newTheme;
  applyConfiguration();
  await persistSettings();
}

// Mute Toggle
async function toggleMute() {
  const isMuted = !currentConfig.muted;
  currentConfig.muted = isMuted;
  applyConfiguration();
  await persistSettings();
}

// Volume input change (real-time updating)
function handleVolumeInput(e: Event) {
  const target = e.target as HTMLInputElement;
  const val = parseFloat(target.value);
  audioElement.volume = val;
  updateVolumeSliderUI(val);
  
  if (val > 0 && currentConfig.muted) {
    currentConfig.muted = false;
    playerCard.classList.remove('muted');
  }
}

// Volume persist (on release)
async function handleVolumeChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const val = parseFloat(target.value);
  currentConfig.volume = val;
  currentConfig.muted = val === 0;
  applyConfiguration();
  await persistSettings();
}

// Progress slider input (while dragging)
function handleProgressInput(e: Event) {
  const target = e.target as HTMLInputElement;
  const percentage = parseFloat(target.value);
  progressFill.style.width = `${percentage}%`;
  
  if (audioElement.duration) {
    const newTime = (percentage / 100) * audioElement.duration;
    currentTimeLabel.textContent = formatTime(newTime);
  }
}

// Progress slider change (on release, seek audio)
function handleProgressChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const percentage = parseFloat(target.value);
  if (audioElement.duration) {
    audioElement.currentTime = (percentage / 100) * audioElement.duration;
  }
}

// Keyboard shortcuts for accessibility/premium feel
function handleKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  }
}

/* Bind DOM Event Listeners */
window.addEventListener('DOMContentLoaded', loadSettings);
window.addEventListener('keydown', handleKeyDown);

playBtn.addEventListener('click', togglePlay);
albumArtDisc.addEventListener('click', togglePlay);
themeToggleBtn.addEventListener('click', toggleTheme);
muteToggleBtn.addEventListener('click', toggleMute);

volumeBar.addEventListener('input', handleVolumeInput);
volumeBar.addEventListener('change', handleVolumeChange);

progressBar.addEventListener('input', handleProgressInput);
progressBar.addEventListener('change', handleProgressChange);

// Audio lifecycle events
audioElement.addEventListener('timeupdate', () => {
  if (!audioElement.seeking) {
    updateProgressSliderUI(audioElement.currentTime, audioElement.duration);
    currentTimeLabel.textContent = formatTime(audioElement.currentTime);
  }
});

audioElement.addEventListener('loadedmetadata', () => {
  totalDurationLabel.textContent = formatTime(audioElement.duration);
});

audioElement.addEventListener('ended', () => {
  playerCard.classList.remove('playing');
  audioElement.currentTime = 0;
  updateProgressSliderUI(0, audioElement.duration);
  currentTimeLabel.textContent = formatTime(0);
});

// Simple track rotation mockup
prevBtn.addEventListener('click', () => {
  console.log("Track anterior (Mock)");
});

nextBtn.addEventListener('click', () => {
  console.log("Siguiente track (Mock)");
});
