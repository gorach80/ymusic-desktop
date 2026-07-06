import { invoke } from '@tauri-apps/api/tauri';

// Interfaz TypeScript que mapea exactamente con la estructura UserConfig de Rust
export interface UserConfig {
  theme: string;
  volume: number; // En Rust es f64, en TS mapea a number
  muted: boolean;
}

/**
 * Llama al backend en Rust para obtener la configuración guardada en el JSON
 */
export async function getConfig(): Promise<UserConfig> {
  try {
    return await invoke<UserConfig>('get_config');
  } catch (error) {
    console.error("Error al obtener la configuración desde Rust:", error);
    throw error;
  }
}

/**
 * Envía la nueva configuración al backend para persistirla en el disco
 * @param config Objeto con el tema, volumen y estado de silencio
 */
export async function saveConfig(config: UserConfig): Promise<void> {
  try {
    // Nota cómo Rust espera 'new_config' pero Tauri mapea automáticamente desde 'newConfig'
    await invoke('save_config', { newConfig: config });
  } catch (error) {
    console.error("Error al guardar la configuración en Rust:", error);
    throw error;
  }
}
