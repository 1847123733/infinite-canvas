// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::error::Error;
use std::sync::Mutex;

use tauri::{Manager, Runtime};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const API_PORT: &str = "38217";

struct ApiSidecar {
    child: Mutex<Option<CommandChild>>,
}

impl ApiSidecar {
    fn kill(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(child) = guard.take() {
                eprintln!("[tauri] Shutting down API sidecar...");
                if let Err(e) = child.kill() {
                    eprintln!("[tauri] Failed to kill sidecar: {}", e);
                }
                eprintln!("[tauri] API sidecar kill signal sent");
            }
        }
    }
}

impl Drop for ApiSidecar {
    fn drop(&mut self) {
        self.kill();
    }
}

fn spawn_api_sidecar<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<CommandChild, Box<dyn Error>> {
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let prompt_dir = data_dir.join("prompts");
    std::fs::create_dir_all(&prompt_dir)?;
    let db_path = data_dir.join("infinite-canvas.db");

    let command = app
        .shell()
        .sidecar("infinite-canvas-api")?
        .env("HOST", "127.0.0.1")
        .env("PORT", API_PORT)
        .env("DESKTOP_MODE", "true")
        .env("GIN_MODE", "release")
        .env("STORAGE_DRIVER", "sqlite")
        .env("DATABASE_DSN", db_path.to_string_lossy().to_string())
        .env("PROMPT_DATA_DIR", prompt_dir.to_string_lossy().to_string());

    let (mut receiver, child) = command.spawn()?;
    tauri::async_runtime::spawn(async move {
        while let Some(event) = receiver.recv().await {
            match event {
                CommandEvent::Stdout(line) => println!("[api] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Stderr(line) => eprintln!("[api] {}", String::from_utf8_lossy(&line)),
                _ => {}
            }
        }
    });
    Ok(child)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            let child = spawn_api_sidecar(app.handle())?;
            app.manage(ApiSidecar {
                child: Mutex::new(Some(child)),
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(sidecar) = window.app_handle().try_state::<ApiSidecar>() {
                    sidecar.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
