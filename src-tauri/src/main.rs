#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use tauri::{GlobalShortcutManager, Manager};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct UserConfig {
    theme: String,
    volume: f64,
    muted: bool,
}

fn get_config_path(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app_handle.path_resolver().app_config_dir().map(|mut path| {
        path.push("config.json");
        path
    })
}

#[tauri::command]
fn get_config(app_handle: tauri::AppHandle) -> UserConfig {
    if let Some(path) = get_config_path(&app_handle) {
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(path) {
                if let Ok(config) = serde_json::from_str::<UserConfig>(&content) {
                    return config;
                }
            }
        }
    }
    // Default fallback configuration
    UserConfig {
        theme: "dark".to_string(),
        volume: 0.8,
        muted: false,
    }
}

#[tauri::command]
fn save_config(app_handle: tauri::AppHandle, new_config: UserConfig) -> Result<(), String> {
    if let Some(path) = get_config_path(&app_handle) {
        // Create config directory if it doesn't exist
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(content) = serde_json::to_string_pretty(&new_config) {
            if std::fs::write(path, content).is_ok() {
                return Ok(());
            }
        }
    }
    Err("Failed to save config".to_string())
}

fn setup_shortcuts(app: &mut tauri::App) {
    let app_handle = app.handle();
    let mut shortcut_manager = app.global_shortcut_manager();
    
    // Register Media Play/Pause and fallback shortcut
    let handle_play = app_handle.clone();
    let _ = shortcut_manager.register("MediaPlayPause", move || {
        let _ = handle_play.emit_all("shortcut-play-pause", ());
    });
    
    let handle_play_fallback = app_handle.clone();
    let _ = shortcut_manager.register("Ctrl+Alt+Space", move || {
        let _ = handle_play_fallback.emit_all("shortcut-play-pause", ());
    });
    
    // Register Mute and fallback shortcut
    let handle_mute = app_handle.clone();
    let _ = shortcut_manager.register("MediaVolumeMute", move || {
        let _ = handle_mute.emit_all("shortcut-mute", ());
    });
    
    let handle_mute_fallback = app_handle.clone();
    let _ = shortcut_manager.register("Ctrl+Alt+M", move || {
        let _ = handle_mute_fallback.emit_all("shortcut-mute", ());
    });
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            setup_shortcuts(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_config, save_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
