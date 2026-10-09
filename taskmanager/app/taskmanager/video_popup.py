"""Popup unique « vidéo + question » pour browser_mod.

Un seul popup plein écran contient la vidéo (en haut) et les boutons OUI / NON (dessous). Quand la
vidéo se termine, le popup passe tout seul en mode « question » : titre et gros boutons, sans rien rouvrir.
Les événements remontent à l'add-on par le journal de HA (même canal que les réponses) :
  answer|<id>|<pièce>|oui|non    réponse
  video|<id>|<pièce>|started     la lecture a démarré
  video|<id>|<pièce>|ended       fin de lecture (ou erreur) : la question prend toute la place
"""

from __future__ import annotations

from html import escape

SEPARATOR = "|"

# Marges internes du popup browser_mod en plein écran, compensées pour remplir tout l'écran.
POPUP_STYLES = (
    "--ha-dialog-surface-background: #000; --mdc-dialog-surface-background: #000;"
)

_CALL = (
    "document.querySelector('home-assistant').hass.callService('logbook','log',"
    "{{name:'taskmanager',domain:'taskmanager',message:'{message}'}})"
)


def _log(kind: str, rid: str, room_id: str, value: str) -> str:
    message = SEPARATOR.join([kind, rid, room_id, value])
    return _CALL.format(message=message.replace("\\", "\\\\").replace("'", "\\'"))


def build_html(*, url: str, mime: str = "", text: str, rid: str, room_id: str,
               video_percent: float, button_height: int) -> str:
    """Contenu HTML du popup. Aucun script : uniquement des attributs d'événements."""
    percent = max(30, min(95, int(video_percent)))
    font = max(16, int(button_height * 0.3))
    ended = "this.closest('.tm-root').dataset.phase='question';" + _log("video", rid, room_id, "ended")
    started = _log("video", rid, room_id, "started")

    def button(value: str, label: str, css: str, icon: str) -> str:
        return (
            f'<button type="button" class="tm-btn {css}" '
            f'onclick="{escape(_log("answer", rid, room_id, value), quote=True)}">'
            f'<ha-icon icon="{icon}"></ha-icon><span>{label}</span></button>'
        )

    return f"""<style>
.tm-root {{ box-sizing: border-box; width: 100vw; height: calc(100vh - 60px); margin: -8px -24px -20px;
  background: #000; color: #fff; display: flex; flex-direction: column; overflow: hidden;
  font-family: Roboto, 'Segoe UI', Arial, sans-serif; }}
.tm-video-box {{ flex: 0 0 {percent}%; min-height: 0; background: #000; }}
.tm-video {{ display: block; width: 100%; height: 100%; object-fit: contain; background: #000; }}
.tm-body {{ flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; }}
.tm-title {{ display: none; text-align: center; font-size: 40px; font-weight: 700; padding: 16px; }}
.tm-buttons {{ display: flex; gap: 8px; padding: 8px; flex: 1; min-height: 0; max-height: {int(button_height)}px; }}
.tm-btn {{ flex: 1; border: 0; border-radius: 12px; color: #fff; font-weight: 700; font-size: {font}px;
  display: flex; align-items: center; justify-content: center; gap: 12px; cursor: pointer;
  --mdc-icon-size: {int(button_height * 0.45)}px; }}
.tm-yes {{ background: #2e7d32; }}
.tm-no {{ background: #c62828; }}
.tm-root[data-phase="question"] .tm-video-box {{ display: none; }}
.tm-root[data-phase="question"] .tm-title {{ display: block; }}
.tm-root[data-phase="question"] .tm-buttons {{ flex: 0 0 160px; height: 160px; max-height: none; }}
.tm-root[data-phase="question"] .tm-btn {{ font-size: 44px; --mdc-icon-size: 72px; }}
</style>
<div class="tm-root" data-phase="video">
  <div class="tm-video-box">
    <video class="tm-video" src="{escape(url, quote=True)}" autoplay playsinline
      onplaying="{escape(started, quote=True)}" onended="{escape(ended, quote=True)}"
      onerror="{escape(ended, quote=True)}"></video>
  </div>
  <div class="tm-body">
    <div class="tm-title">{escape(text)}</div>
    <div class="tm-buttons">
      {button("oui", "OUI", "tm-yes", "mdi:check-bold")}
      {button("non", "NON", "tm-no", "mdi:close-thick")}
    </div>
  </div>
</div>"""
