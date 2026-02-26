# Runbook: Comandos de interés para Asterisk

**Objetivo:** Documento de consulta rápida para operación/soporte de Asterisk (logs, colas y patrones de dialplan).  
**Audiencia:** NOC / Telefonía / Soporte.  
**Tags:** asterisk, logs, queues, agentes, dialplan, troubleshooting  
**Última actualización:** 2026-02-24

---

## 1) Logs (monitoreo y búsqueda)

### 1.1 Ver una llamada en vivo filtrando por número
**Propósito:** monitorear en tiempo real el log de Asterisk y ver eventos relacionados con un número específico.

**Comando:**
```bash
tail -f /var/log/peke/asterisk.log | grep "947474461"
```

**Parámetros:**
- `/var/log/peke/asterisk.log`: ruta del log.
- `947474461`: texto/número a filtrar (cámbialo por el ANI/DID/identificador real).

**Uso típico:**
- Cuando necesitas ver en vivo el flujo de una llamada.

**Notas:**
- Detener con `Ctrl+C`.
- Si el número no aparece, prueba filtrar por `UniqueID`, `SIP Call-ID` o extensión.

---

### 1.2 Ver el log completo asociado a un Call-ID / identificador
**Propósito:** recuperar todas las líneas del log relacionadas con un identificador específico de llamada.

**Comando:**
```bash
grep "C-0005eefe" /var/log/peke/asterisk.log
```

**Parámetros:**
- `C-0005eefe`: identificador/cadena de la llamada (reemplazar por el valor real).

**Uso típico:**
- Análisis post-mortem de una llamada ya ocurrida.

---

### 1.3 Ver las últimas N líneas relacionadas con una extensión/numeración
**Propósito:** ver contexto reciente sin imprimir todo el archivo.

**Comando:**
```bash
grep "ext2014110" /var/log/peke/asterisk.log | tail -n 20
```

**Parámetros:**
- `ext2014110`: texto a buscar (extensión, endpoint, etc.).
- `20`: cantidad de líneas finales a mostrar.

**Uso típico:**
- Cuando el log es grande y necesitas solo lo último.

---

## 2) Colas (Queues) y agentes

### 2.1 Despausar (unpause) un agente de una cola
**Propósito:** reactivar un agente pausado en una cola.

**Comando:**
```bash
asterisk -rx "queue unpause member Local/20@sipagent/n queue 20188Alcala2"
```

**Parámetros:**
- `Local/20@sipagent/n`: identificador del miembro/agente (puede variar según tu configuración).
- `20188Alcala2`: nombre o id de la cola.

**Uso típico:**
- Cuando un agente quedó pausado y debe volver a recibir llamadas.

**Precauciones:**
- Impacta operación en producción. Recomiendo verificar antes el estado con `queue show`.

---

### 2.2 Ver miembros/estado de una cola
**Propósito:** listar miembros, pausas, llamadas en espera, etc.

**Comando:**
```bash
asterisk -rx "queue show 20185GRUPOS"
```

**Parámetros:**
- `20185GRUPOS`: cola a consultar.

**Uso típico:**
- Diagnóstico de disponibilidad y estado de agentes.

---

## 3) Dialplan: patrones de extensiones (resumen de intención)

> **Nota:** lo siguiente son patrones del dialplan (por ejemplo en `extensions.conf` o archivos incluidos). Sirve para identificar qué hace un prefijo/tecla rápida.

### 3.1 Patrones y descripción (tal cual)
```asterisk
exten => _*[d][c][g].,1,Verbose(Creación de confbridge para Webphone)
exten => _**X.,1,Verbose(Alias a #${EXTEN:2})
exten => _*8.,1,Verbose(Captura de llamada desde ${SRC_COMPANY}${SRC_EXTENSION} hacia ${EXTEN:2})
exten => _*98X.,1,NoOp(Llamada al buzón general: ${EXTEN:3} desde ${SRC_COMPANY}${SRC_EXTENSION})
exten => _*7000,1,Verbose(Activar CFU al buzón de voz)
exten => _*70X.,1,Verbose(Activar CFU: ${EXTEN:3})
exten => _*65,1,Verbose(Pausa de agente ${SRC_COMPANY}${SRC_EXTENSION} Global)
exten => _*68,1,Verbose(Reanudar agente ${SRC_COMPANY}${SRC_EXTENSION} Global)
exten => _*65X.,1,Verbose(Pausa de agente ${SRC_COMPANY}${SRC_EXTENSION} en cola ${EXTEN:3})
exten => _*30,1,Verbose(Solicitud de finalización de llamada por ${SRC_COMPANY}${SRC_EXTENSION})
exten => _*66,1,Verbose(Gestión de bloqueo global)
exten => _*99X.,1,Verbose(Forzar salida DDI solicitada)
```

### 3.2 Glosario rápido (para interpretación)
- `EXTEN`: la extensión marcada.
- `${EXTEN:2}` / `${EXTEN:3}`: substring de la extensión (ej. quitar prefijo).
- `X`: cualquier dígito `0–9`.
- `_*...`: patrón (no extensión exacta).
- `Verbose()` / `NoOp()`: logging / traza (NoOp no ejecuta acción, solo deja marca).

Variables usadas en los mensajes:
- `SRC_COMPANY`: empresa/origen (según tu dialplan).
- `SRC_EXTENSION`: extensión origen (según tu dialplan).

---

## 4) Preguntas típicas (FAQ interna)
- **¿Cómo veo una llamada en vivo por número?**  
  Usa `tail -f ... | grep "NUMERO"` (ver sección 1.1).

- **¿Cómo recupero todo lo relacionado a una llamada por su ID?**  
  Usa `grep "CALL_ID" ...` (ver sección 1.2).

- **¿Cómo veo lo último que pasó con una extensión?**  
  Usa `grep "extXXXX" ... | tail -n 20` (ver sección 1.3).

- **¿Cómo despauso un agente en una cola?**  
  `asterisk -rx "queue unpause member ... queue ..."` (ver sección 2.1).

- **¿Cómo reviso quién está en una cola y su estado?**  
  `asterisk -rx "queue show COLA"` (ver sección 2.2).