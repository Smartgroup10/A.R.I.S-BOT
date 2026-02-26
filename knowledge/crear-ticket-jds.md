# Guia: Como Crear y Gestionar Tickets en JDS

> **Sistema**: JDS (JD Systems) - CRM de gestion de tickets de Smartgroup
> **Fuente**: Guia JDS - Creacion de Ticket (julio 2023)

---

## 1. Acceder a la bandeja de correo

1. Inicia sesion en el sistema JDS.
2. En el menu lateral izquierdo (**INDICE**), haz clic en **Correo** > **Consultar correo**.
3. Se mostrara la bandeja de correos entrantes con las siguientes columnas:
   - **#** (numero de mail)
   - **Fecha-Hora**
   - **Area** (por defecto "Atencion cliente")
   - **Emisor**
   - **Destinatario**
   - **Asunto**
   - **Estado** (icono que indica si esta leido/pendiente)

---

## 2. Seleccionar el correo para abrir un ticket

1. Localiza el correo que deseas gestionar en la lista.
2. Haz clic sobre el **numero de mail** (enlace azul, por ejemplo `012603`).
3. Se abrira la vista detallada del correo, mostrando:
   - **Asunto**, **Remitente**, **Destinatarios** y **Area**.
   - El cuerpo del correo en la parte inferior.
   - Informacion adicional: N.o Mail, Fecha, Hora, Carpeta (Entrada), Bloqueo (usuario asignado), Fecha bloqueo, Estado (Leido, pendiente).

---

## 3. Asignar el cliente al correo

1. En el campo **Cliente**, selecciona de la lista desplegable el cliente al que pertenece el correo.
2. Si es necesario, verifica o ajusta el campo **Distribuidor**.
3. Opcionalmente, puedes asociar un **Telefono** del cliente.
4. Haz clic en el boton **Grabar** (parte superior) para guardar la asignacion del cliente al correo.

> **Nota**: Es fundamental asignar correctamente el cliente antes de crear el ticket, ya que esta informacion se hereda al ticket.

---

## 4. Elegir la accion sobre el correo

Una vez asignado el cliente y grabado, en el panel de **Acciones** (parte derecha de la pantalla) aparecen cuatro opciones:

| Accion | Cuando usarla |
|---|---|
| **Crear nuevo Ticket** | Si el ticket es nuevo y no existe uno previo relacionado. |
| **Asignar Ticket Abierto** | Si ya existe un ticket previamente creado para esta incidencia. |
| **Cerrar sin mas acciones** | Si el ticket ya fue cerrado o no requiere gestion adicional. |
| **Correo Spam/Basura** | Si el correo no tiene sentido o es spam. |

---

## 5. Crear un nuevo ticket

1. Selecciona la opcion **Crear nuevo Ticket**.
2. El sistema mostrara un cuadro de dialogo: *"Confirme operacion [Crear nuevo ticket]?"*
3. Haz clic en **Confirmar**.
4. Se abrira una **nueva pestana** con el formulario del ticket.

---

## 6. Rellenar los campos del ticket

En la nueva pestana del ticket, debes completar los siguientes campos:

### 6.1. Campos generales

| Campo | Descripcion |
|---|---|
| **Perfil** | Selecciona entre "Atencion al cliente" u "Oficina Tecnica". |
| **Tema** | Depende del perfil seleccionado (ver detalle abajo). |
| **Tipo de Ticket** | Depende del tema seleccionado (ver detalle abajo). |
| **Fecha** | Fecha limite para resolver la incidencia. |
| **Compromiso** | Tiempo comprometido (por ejemplo: "72 HORAS", "inmediato"). |
| **Prioridad** | Nivel de prioridad de la incidencia (Baja, Media, Alta, Urgente). |
| **Distribuidor** | Se hereda del correo (por ejemplo: SMARTGROUP VOIP SERVICES SL). |
| **Cliente** | Se hereda del correo (por ejemplo: SMARTGROUP VOIP SERVICES, S.L.). |
| **Contacto** | Persona de contacto del cliente. |
| **Telefono** | Telefono de contacto. |
| **Calle / CP** | Direccion del cliente (si aplica). |

### 6.2. Perfil: Atencion al cliente

- **Temas disponibles**:
  - Informacion
  - Gestion BO
  - Incidencias
  - Oficina Tecnica

- **Tipos de Ticket** (para los temas Gestion BO e Incidencias):
  - Captura
  - Centralita
  - Conectividad
  - Configuracion Endpoint
  - Equipos Informaticos
  - Instalacion de Equipos Nuevos

### 6.3. Perfil: Oficina Tecnica

- **Tema**: Gestion BO
- **Tipos de Ticket**:
  - Instalacion
  - Visita/Valoracion
- **Prioridad**: Seleccionar el nivel de prioridad.
- **Fecha**: Dependera de la disponibilidad.

### 6.4. Campos de texto

El formulario del ticket tiene tres pestanas principales: **Seguimiento**, **Mail respuesta** y **Traza interna**.

En la pestana **Seguimiento** encontraras:

| Campo | Descripcion |
|---|---|
| **Descripcion de la incidencia** | Escribe una breve descripcion del problema o solicitud. |
| **Solucion** | Cuando el ticket este resuelto, describe aqui la solucion aplicada. |
| **Seguimiento interno** | Registra todos los cambios y acciones realizadas sobre el ticket, **siempre especificando la fecha**. Formato recomendado: `DD/MM/AAAA - Descripcion de la accion realizada`. |

---

## 7. Opciones de gestion del ticket (barra superior)

Una vez que rellenas los campos del ticket, se activan en la barra superior las siguientes opciones:

### 7.1. Opciones de escalado

| Opcion | Cuando usarla |
|---|---|
| **Escalar Operador** | Solo cuando se necesita enviar la incidencia a un operador externo (por ejemplo: Astroline, LCR, Movistar, GORED). |
| **Escalar Gestor** | Cuando se necesita pasar la gestion a Comerciales. |
| **Escalar a BO** | Cuando la incidencia la esta tratando Atencion al Cliente (AT) u Oficina Tecnica (OT) y necesita intervencion de Back Office. |
| **Escalar a Cliente** | Cuando se envia un correo al cliente, ya sea para solicitar informacion adicional o por cualquier otra gestion. |

### 7.2. Otras acciones

| Opcion | Cuando usarla |
|---|---|
| **Cerrar** | Cuando el ticket esta resuelto y se desea cerrar. |
| **Mail Clie.** (Mail Cliente) | Abre un apartado para redactar y enviar un correo al cliente. |
| **Mail Oper.** (Mail Operador) | Abre un apartado para redactar y enviar un correo al operador. |

---

## 8. Enviar correo al cliente (Mail Cliente)

1. Haz clic en **Mail Clie.** en la barra superior.
2. Se abrira la pestana **Mail respuesta** con un editor de correo.
3. Los campos que aparecen son:
   - **Remitente**: Selecciona el remitente (por ejemplo: General).
   - **Destinatarios**: Se autocompleta con el correo del cliente.
   - **Asunto**: Se autocompleta con "RE:" seguido del asunto original.
4. Redacta el cuerpo del correo. El formato por defecto es:
   ```
   Estimado Cliente,

   xxxxxxxxxxxxxxxx

   Reciba un cordial saludo,

   @FIRMA@
   ```
5. Puedes usar **Plantillas Predeterminadas** (disponibles en el panel lateral derecho, seccion **PLANTILLAS CLIENTE**) para rellenar automaticamente el correo.
6. Para enviar el correo, debes seleccionar alguna de las opciones de escalado en la barra superior (por ejemplo: Escalar a Cliente), dependiendo de la gestion que se este realizando.

> **Nota**: En la seccion **MAILS** (panel lateral derecho) aparecen las interacciones, tanto las enviadas por nosotros como las recibidas del cliente.

---

## 9. Enviar correo al operador (Mail Operador)

1. Haz clic en **Mail Oper.** en la barra superior.
2. Se abrira un formulario con los campos:
   - **Operador**: Selecciona el operador de la lista desplegable. Opciones disponibles:
     - LCR Tramitaciones
     - LCR Bajas
     - LCR NOC
     - Astroline
     - Movistar
     - GORED
     - SMARTGROUP
   - **Destinatarios**: Se asigna automaticamente el correo del operador seleccionado.
   - **Asunto**: Escribe el asunto del correo.
3. Redacta el cuerpo del correo. El formato por defecto es:
   ```
   Estimado Operador,

   xxxxxxxxxxxxxxxx

   Reciba un cordial saludo,

   @FIRMA@
   ```
4. Puedes usar **Plantillas Predeterminadas** para rellenar automaticamente el correo.
5. En este caso, **solo se puede seleccionar la opcion Escalar Operador** en la barra superior, ya que al enviarle un correo al operador, estamos a la espera de su gestion.

---

## 10. Cerrar un ticket

1. Asegurate de que la incidencia esta completamente resuelta.
2. Rellena el campo **Solucion** con la descripcion detallada de la solucion aplicada.
3. Haz clic en el boton **Cerrar** en la barra superior.
4. El estado del ticket cambiara a cerrado.

---

## MUY IMPORTANTE: Seguimiento interno

> **Todo lo que se haga debe quedar registrado en el campo Seguimiento Interno.**

- Cada vez que se realice una accion sobre el ticket (llamada, correo enviado, escalado, cambio de estado, etc.), debe documentarse en este campo.
- **Siempre especificar la fecha** al inicio de cada entrada.
- Formato recomendado:
  ```
  DD/MM/AAAA - Descripcion de las modificaciones que tenga la incidencia.
  ```
- Ejemplo:
  ```
  26/07/2023 - Se recibe correo del cliente reportando problema de conectividad.
  26/07/2023 - Se escala a operador LCR para revision de linea.
  27/07/2023 - LCR confirma que la linea esta operativa. Se contacta al cliente.
  28/07/2023 - Cliente confirma que el servicio funciona correctamente. Se cierra ticket.
  ```

---

## Resumen del flujo completo

```
Consultar correo
       |
       v
Seleccionar correo
       |
       v
Asignar cliente --> Grabar
       |
       v
Elegir accion:
  - Crear nuevo Ticket -----> Confirmar -----> Rellenar campos del ticket
  - Asignar Ticket Abierto
  - Cerrar sin mas acciones
  - Correo Spam/Basura
       |
       v
Gestionar ticket:
  - Rellenar: Perfil, Tema, Tipo, Fecha, Prioridad
  - Escribir: Descripcion, Seguimiento Interno
  - Escalar segun corresponda
  - Enviar correos (Mail Cliente / Mail Operador)
       |
       v
Resolver y documentar solucion
       |
       v
Cerrar ticket
```

---

## Pestanas del ticket

El ticket cuenta con tres pestanas en la seccion central:

1. **Seguimiento**: Contiene los campos Descripcion de la incidencia, Solucion y Seguimiento interno. Es la pestana principal de trabajo.
2. **Mail respuesta**: Se utiliza para redactar y enviar correos al cliente o al operador.
3. **Traza interna**: Registro interno del sistema con el historial de acciones automaticas.

---

## Panel lateral derecho

En el panel lateral derecho del ticket se encuentran:

- **MAILS**: Listado de correos asociados al ticket (ID, Fecha, Hora, Asunto).
- **ESTRUCTURA DE CUENTAS**: Informacion de la estructura de cuentas del cliente.
- **PLANTILLAS CLIENTE**: Plantillas predeterminadas para los correos al cliente.
- **LINEAS CLIENTE**: Informacion de las lineas del cliente.

---

*Documento generado a partir de la Guia JDS - Creacion de Ticket de Smartgroup.*
