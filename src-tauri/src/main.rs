#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    let overlay_shortcut =
                        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyE);
                    if shortcut == &overlay_shortcut && event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            toggle_overlay(window);
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let overlay_shortcut =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyE);
            if let Err(error) = app.global_shortcut().register(overlay_shortcut) {
                eprintln!("Impossible d’enregistrer Ctrl+Maj+E : {error}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Erreur au démarrage d’ESO Companion");
}

fn toggle_overlay(window: WebviewWindow) {
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
