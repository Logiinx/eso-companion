# ESO Companion

Compagnon personnel pour le serveur européen d’ESO. L’interface fonctionne en local et conserve les tâches et les notes sur l’appareil.

## Version Windows portable

Chaque mise à jour de `main` qui touche `web/` ou `src-tauri/` lance une compilation Windows. Le fichier `eso_companion.exe` est publié comme artefact GitHub Actions sous le nom `eso-companion-windows-portable` pendant 7 jours.

L’application n’a pas d’installateur. Elle utilise le runtime WebView2 de Windows, généralement déjà présent sur Windows 10 et 11. Le raccourci `Ctrl + Maj + E` masque ou réaffiche sa fenêtre, qui reste au premier plan.

Les données ne voyagent pas avec l’exécutable : elles sont stockées dans le profil Windows de l’utilisateur. Utilise l’export JSON de l’application pour sauvegarder ou déplacer tes données.

## Interface web

Ouvre `web/index.html` dans un navigateur pour utiliser la version web.
