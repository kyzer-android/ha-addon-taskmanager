#!/usr/bin/with-contenv bashio
# Lance l'add-on : le niveau de log vient des options de l'add-on.
export TM_LOG_LEVEL="$(bashio::config 'log_level')"
export TM_DATA_DIR="/config/taskmanager"
export TM_MEDIA_DIR="/media"
bashio::log.info "Démarrage du gestionnaire de tâches (niveau de log : ${TM_LOG_LEVEL})"
cd /app
exec python3 -m taskmanager
