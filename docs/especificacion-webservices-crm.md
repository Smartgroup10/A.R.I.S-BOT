# Especificación de Web Services — Integración CRM con Asistente IA

**Fecha:** 2026-02-20
**Objetivo:** Exponer web services desde el CRM para que el asistente corporativo (NovaBOT) pueda consultar datos de clientes en tiempo real.
**Consumidor:** Backend Node.js (Express) del asistente.
**Formato preferido:** SOAP/WSDL o REST/JSON (cualquiera de los dos funciona).

---

## 1. Autenticación

Se necesita un método de autenticación para todas las llamadas. Opciones (de más a menos recomendada):

| Opción | Implementación |
|--------|---------------|
| **API Token (recomendado)** | Header `Authorization: Bearer <token>` o parámetro `api_key`. Token fijo que se guarda en el servidor del bot. |
| **Usuario + Contraseña** | Header `Authorization: Basic <base64>`. Menos seguro pero funcional. |
| **Token en el WSDL** | Parámetro `<token>` en cada llamada SOAP. |

**Importante:** El bot solo necesita permisos de **lectura** (solo consultas, nunca escritura/modificación).

---

## 2. Web Services requeridos

### 2.1 Buscar cliente por nombre

**Propósito:** Cuando un empleado pregunta "¿Qué tenemos de Autobafer?" el bot necesita encontrar el cliente.

```
Método:    buscarClientePorNombre
Entrada:   nombre (string) — Búsqueda parcial, ej: "autoba" debe encontrar "Autobafer"
Salida:    Lista de coincidencias:
  [
    {
      cliente_id:    (int/string)    — ID único del cliente
      nombre:        (string)        — Nombre completo / razón social
      cif_nif:       (string)        — CIF o NIF
      estado:        (string)        — Activo / Inactivo / Suspendido
      fecha_alta:    (date)          — Fecha de alta como cliente
    }
  ]
```

**Notas:**
- La búsqueda debe ser **parcial** y **case-insensitive** (que "sushi" encuentre "Sushita")
- Limitar a máximo 10 resultados
- Si no hay coincidencias, devolver lista vacía (no error)

---

### 2.2 Buscar cliente por número de línea

**Propósito:** Cuando un empleado dice "¿De quién es el 912345678?" el bot debe encontrar al cliente dueño de esa línea.

```
Método:    buscarClientePorLinea
Entrada:   numero (string) — Número de teléfono, ej: "912345678"
Salida:
  {
    cliente_id:    (int/string)
    nombre:        (string)
    numero:        (string)        — El número buscado
    tipo_linea:    (string)        — Fija / Móvil / SIP / Trunk
    estado_linea:  (string)        — Activa / Suspendida / Portando
  }
```

**Notas:**
- Buscar tanto con como sin prefijo (+34, 0034, etc.)
- Si el número no existe, devolver null/vacío

---

### 2.3 Obtener datos completos del cliente

**Propósito:** Una vez identificado el cliente, obtener toda su información de contacto.

```
Método:    getCliente
Entrada:   cliente_id (int/string)
Salida:
  {
    cliente_id:        (int/string)
    nombre:            (string)        — Razón social
    nombre_comercial:  (string)        — Nombre comercial (si difiere)
    cif_nif:           (string)
    estado:            (string)        — Activo / Inactivo / Suspendido
    fecha_alta:        (date)

    direccion_fiscal: {
      calle:           (string)
      ciudad:          (string)
      provincia:       (string)
      codigo_postal:   (string)
    }

    contacto_principal: {
      nombre:          (string)
      telefono:        (string)
      email:           (string)
      cargo:           (string)
    }

    contactos_adicionales: [
      {
        nombre:        (string)
        telefono:      (string)
        email:         (string)
        cargo:         (string)
      }
    ]

    comercial_asignado: (string)       — Nombre del comercial de la empresa
    notas:             (string)        — Notas generales del cliente
  }
```

---

### 2.4 Obtener líneas telefónicas del cliente

**Propósito:** "¿Cuántas líneas tiene Autobafer?" / "¿Qué números tiene Sushita?"

```
Método:    getLineasCliente
Entrada:   cliente_id (int/string)
Salida:    Lista de líneas:
  [
    {
      linea_id:        (int/string)
      numero:          (string)        — Ej: "912345678"
      tipo:            (string)        — Fija / Móvil / SIP / Trunk / Virtual
      estado:          (string)        — Activa / Suspendida / En portabilidad / Baja
      sede:            (string)        — Ubicación/sede donde está la línea
      fecha_alta:      (date)
      tarifa:          (string)        — Nombre del plan/tarifa
      observaciones:   (string)        — Notas sobre esta línea
    }
  ]
```

---

### 2.5 Obtener fibras / conexiones de datos del cliente

**Propósito:** "¿Qué fibras tiene Sushita y dónde están instaladas?"

```
Método:    getFibrasCliente
Entrada:   cliente_id (int/string)
Salida:    Lista de conexiones:
  [
    {
      fibra_id:        (int/string)
      tipo:            (string)        — FTTH / ADSL / 4G Backup / Radio
      estado:          (string)        — Activa / En instalación / Averiada / Baja
      velocidad:       (string)        — Ej: "600Mb/600Mb", "100Mb/100Mb"
      proveedor:       (string)        — Operador mayorista si aplica
      referencia:      (string)        — Nº de circuito / referencia del operador

      direccion_instalacion: {
        calle:         (string)
        ciudad:        (string)
        provincia:     (string)
        codigo_postal: (string)
      }

      fecha_alta:      (date)
      observaciones:   (string)
    }
  ]
```

---

### 2.6 Obtener servicios contratados

**Propósito:** "¿Qué servicios tiene contratados Autobafer?"

```
Método:    getServiciosCliente
Entrada:   cliente_id (int/string)
Salida:    Lista de servicios:
  [
    {
      servicio_id:     (int/string)
      nombre:          (string)        — Ej: "Centralita PBX", "Fibra 600Mb", "SIP Trunk"
      categoria:       (string)        — Telefonía / Internet / Cloud / Mantenimiento / Otro
      estado:          (string)        — Activo / Suspendido / Pendiente / Baja
      fecha_inicio:    (date)
      fecha_fin:       (date|null)     — null si indefinido
      precio_mensual:  (number|null)   — Si se puede compartir
      observaciones:   (string)
    }
  ]
```

---

### 2.7 Obtener histórico de tickets

**Propósito:** "¿Qué incidencias ha tenido Sushita?" / "¿Hay tickets abiertos de Autobafer?"

```
Método:    getTicketsCliente
Entrada:
  cliente_id (int/string)
  estado     (string, opcional)   — "abierto" / "cerrado" / "todos" (default: "todos")
  limite     (int, opcional)      — Máximo de tickets a devolver (default: 20)

Salida:    Lista de tickets (ordenados del más reciente al más antiguo):
  [
    {
      ticket_id:       (int/string)
      asunto:          (string)
      descripcion:     (string)        — Descripción breve del problema
      estado:          (string)        — Abierto / En curso / Pendiente cliente / Resuelto / Cerrado
      prioridad:       (string)        — Baja / Media / Alta / Crítica
      categoria:       (string)        — Avería / Consulta / Instalación / Cambio / Otro

      fecha_creacion:  (datetime)
      fecha_cierre:    (datetime|null)

      tecnico_asignado: (string)       — Nombre del técnico
      resolucion:      (string|null)   — Cómo se resolvió (si ya está cerrado)

      ultima_nota:     (string|null)   — Última actualización/comentario
    }
  ]
```

---

## 3. Formato de respuesta

### Si usáis SOAP/WSDL:
- Publicar el WSDL en una URL accesible desde el servidor del bot
- Formato XML estándar
- Ejemplo URL: `https://crm.miempresa.com/ws/clientes?wsdl`

### Si usáis REST/JSON (más fácil de integrar):
- Base URL: `https://crm.miempresa.com/api/v1/`
- Formato JSON
- Endpoints:

```
GET  /clientes/buscar?nombre=autobafer          → 2.1
GET  /clientes/buscar?linea=912345678           → 2.2
GET  /clientes/{id}                              → 2.3
GET  /clientes/{id}/lineas                       → 2.4
GET  /clientes/{id}/fibras                       → 2.5
GET  /clientes/{id}/servicios                    → 2.6
GET  /clientes/{id}/tickets?estado=todos&limite=20  → 2.7
```

---

## 4. Manejo de errores

Todas las respuestas deben incluir un código de estado claro:

```json
// Éxito
{ "status": "ok", "data": [ ... ] }

// Sin resultados (NO es un error)
{ "status": "ok", "data": [] }

// Error
{ "status": "error", "message": "Cliente no encontrado", "code": 404 }
```

---

## 5. Consideraciones de seguridad

1. **Solo lectura**: El bot NO necesita crear, modificar ni eliminar nada en el CRM.
2. **Token dedicado**: Crear un token/usuario específico para el bot con permisos mínimos.
3. **Sin datos bancarios**: No exponer cuentas bancarias, números de tarjeta, ni datos financieros sensibles.
4. **Acceso por IP (opcional)**: Si es posible, restringir el acceso al WS solo desde la IP del servidor del bot.
5. **HTTPS obligatorio**: Todas las llamadas deben ir por HTTPS.

---

## 6. Ejemplo de uso real

Un empleado escribe en el chat del bot:

> "¿Qué líneas y fibras tiene Sushita? ¿Tienen algún ticket abierto?"

El bot haría internamente:

1. `buscarClientePorNombre("Sushita")` → obtiene `cliente_id: 42`
2. `getLineasCliente(42)` → lista de líneas
3. `getFibrasCliente(42)` → lista de fibras con direcciones
4. `getTicketsCliente(42, estado="abierto")` → tickets abiertos

Y respondería algo como:

> "Sushita tiene 3 líneas fijas y 2 fibras:
> - Fibra 600Mb en la fábrica (C/ Industrial 5, Madrid) — activa
> - Fibra 300Mb en la oficina (C/ Gran Vía 10, Madrid) — activa
>
> Tienen 1 ticket abierto: #1234 'Corte intermitente en fibra fábrica' (prioridad alta, asignado a Pedro). Se abrió hace 2 días."

---

## 7. Prioridad de implementación

| Prioridad | Web Service | Impacto |
|-----------|-------------|---------|
| **Alta** | buscarClientePorNombre | Sin esto el bot no puede encontrar clientes |
| **Alta** | getCliente | Datos básicos, lo más consultado |
| **Alta** | getLineasCliente | Core del negocio |
| **Media** | getFibrasCliente | Muy consultado en soporte |
| **Media** | getTicketsCliente | Historial de incidencias |
| **Media** | getServiciosCliente | Resumen de contratación |
| **Baja** | buscarClientePorLinea | Útil pero menos frecuente |

---

**Contacto para dudas técnicas de integración:** [tu nombre/email aquí]
**Plazo estimado para integrar en el bot:** 1-2 días una vez los WS estén disponibles.
