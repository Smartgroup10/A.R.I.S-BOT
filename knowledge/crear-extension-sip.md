# Procedimiento: Creacion y Registro de Extension SIP

> Departamento de Soporte Tecnico

## Indice

1. [FASE I. Solicitud de incidencia en JDS](#fase-i-solicitud-de-incidencia-en-jds)
2. [FASE II. Clasificacion del Ticket en JDS](#fase-ii-clasificacion-del-ticket-en-jds)
3. [FASE III. Creacion de extension en la centralita](#fase-iii-creacion-de-extension-en-la-centralita)
4. [FASE IV. Registro de extension en dispositivo SIP](#fase-iv-registro-de-extension-en-dispositivo-sip)
5. [FASE V. Verificacion de correcto funcionamiento](#fase-v-verificacion-de-correcto-funcionamiento)
6. [FASE VI. Finalizacion de Ticket en JDS](#fase-vi-finalizacion-de-ticket-en-jds)

---

## FASE I. Solicitud de incidencia en JDS

Para procesar una incidencia, primero recibimos la peticion por nuestro CRM por parte del cliente.

Luego de recibir la solicitud correspondiente por parte del cliente, procedemos a clasificarla segun lo que amerite.

---

## FASE II. Clasificacion del Ticket en JDS

Cuando recibimos el correo, tenemos que crear el ticket y asignarlo al cliente que corresponda. El cliente ya tiene que estar previamente dado de alta por parte del departamento comercial.

### Pasos para clasificar el ticket

1. Seleccionar el apartado azul del correo.
2. Se abrira una nueva ventana donde hay que rellenar los siguientes campos:
   - **Cliente**: Previamente creado por el area comercial. Pulsar **Grabar**.
   - **Crear Nuevo Ticket** y pulsar **Confirmar**.

> **Nota importante**: El departamento comercial tiene que dar de alta al cliente previamente para poder asignar la solicitud al cliente correspondiente. Si el cliente no esta dado de alta, informar al departamento comercial para que lo den de alta.

### Campos del ticket

- **Tema**: Gestion BO (siempre Gestion BO)
- **Tipo de Ticket**: Centralita
- **Compromiso**: Tiempo para cumplir con el registro de extension
- **Fecha**: Fecha maxima para resolver el ticket
- **Prioridad**: Alta
- **Descripcion de la incidencia**: Describir la solicitud del alta de la extension solicitada
- **Seguimiento Interno**: Describir todos los avances de la solicitud en cuestion

### Despues de rellenar los campos

1. Seleccionar la opcion **Escalar a BO**.
2. Enviar respuesta al cliente: ir a la opcion **Mail cliente** y enviar una respuesta generica indicando que se esta poniendo en marcha su solicitud.
3. Despues de redactar el mail, volver a seleccionar **Escalar a BO** para que se envie. Para comprobar que se envio el correo, debe aparecer en el apartado izquierdo el mail en cuestion.

---

## FASE III. Creacion de extension en la centralita

Existen distintos tipos de centralitas virtuales. A continuacion se explica como crear extensiones en las mas usadas.

### 1. PekePBX

- **URL**: `https://pbx2.smartgroupcloud.com:1443/#!/login`
- **Usuario**: `soporte@smartgroup.es`
- **Password**: Apuntada en fichero correspondiente

#### Crear extension en PekePBX

1. En el **Menu Lateral**, ir a **Usuarios**.
2. Seleccionar **Anadir nuevo**. Se abrira una ventana con los siguientes campos:

| Campo | Descripcion |
|-------|-------------|
| **Rol de Usuario** | Seleccionar entre Usuario o Administrador |
| **Email** | Email del usuario |
| **Nombre Completo** | Nombre de la extension |
| **Contrasena** | Contrasena para que el usuario acceda a la centralita (poner cualquiera) |
| **Extension** | Numeracion de la extension (ej: 10) |
| **Permitir solo llamadas internas** | Marcar si la extension solo debe hacer llamadas internas |
| **Contrasena SIP** | Contrasena de registro SIP de la extension |
| **CallerID** | Numeracion con la que va a emitir la extension |

3. Rellenar los datos y pulsar **Guardar**.
4. El sistema devuelve a la ventana de usuarios donde aparecera la extension creada.

### 2. MeetIP

- **URL** (ejemplo): `https://sip17.meetip.net/`
- **Servidores disponibles**: SIP1, SIP2, SIP7 y SIP17
- **Usuario** (todos los servidores): `soporte@smartgroup.es`
- **Password**: En fichero correspondiente

#### Crear extension en MeetIP

1. Acceder a la centralita y ubicar al cliente (clasificados por **Tenant**).
2. Acceder al cliente y seleccionar **Extension** > **Sistema**.
3. Seleccionar **Anadir extension**.
4. Rellenar los campos:
   - **Dispositivos**: Generic SIP
   - **Localidad**: Remoto
5. Pulsar **Proximo paso**.
6. Rellenar los siguientes datos:
   - **Numero de extension**: Seleccionar el numero de extension a crear
   - **Nombre**: Nombre para la extension
   - **Correo electronico**: Correo al que asociar la extension
   - **Departamento**: Departamento dentro de la empresa (opcional)
7. Pulsar **Guardar**.
8. La extension aparecera creada en el panel **Extensiones** > **Sistema**.

### 3. Centralita Yeastar

- **URL** (ejemplo): `http://cv.zerocoma.com/`
- **Usuario**: `admin`
- **Password**: La del fichero de cada cliente
- Las centralitas Yeastar suelen estar fisicas en el cliente.

#### Crear extension en Yeastar

1. Ir a **Settings** > **Extensions**.
2. Seleccionar **ADD**.
3. Rellenar los campos en el apartado **Basic**:

| Campo | Descripcion |
|-------|-------------|
| **Type** | SIP |
| **Extension** | Numero de extension |
| **Caller ID Name** | Numero de la extension |
| **Registration Name** | Nombre o numero de registro de la extension |
| **Concurrent Registrations** | Numero de dispositivos en los que registrar la extension |

4. Ir al apartado **Advance** y marcar la opcion **NAT** (necesario para que la extension registre y se escuche correctamente).
5. Pulsar **Save** y luego **Apply**.

> **Importante**: El **Apply** es obligatorio. Si no se pulsa Apply, no se guardaran los cambios.

---

## FASE IV. Registro de extension en dispositivo SIP

Una vez creada la extension en la centralita, se procede a registrarla en el dispositivo SIP que necesite el cliente. Hay 3 metodos habituales:

### 1. Telefonos de Voz IP (ej. Yealink)

1. El telefono debe estar conectado a la red de internet.
2. Obtener la IP del telefono y acceder a la interfaz web (ej: `http://192.168.172.131`).
   - **Usuario**: `admin`
   - **Password**: La del fichero correspondiente
3. Ir al apartado **Account** (Cuenta) y rellenar los siguientes campos:

| Campo | Valor |
|-------|-------|
| **Line Active** | Enable |
| **Label** | Nombre o etiqueta de la extension |
| **Display Name** | Nombre que mostrara en el display del telefono |
| **Register Name** | Nombre del registro de la extension (proporcionado por la centralita) |
| **User Name** | Igual que Register Name |
| **Password** | Contrasena proporcionada por la centralita |
| **Server Host** | Servidor de la centralita |
| **Port** | Puerto de registro de la centralita |
| **Transport** | UDP |
| **Server Expires** | 180 (tiempo en segundos de reintento en caso de caida) |
| **Server Retry Counts** | 3 (intentos de registro) |

4. Pulsar **Confirm**.
5. Verificar que en **Register Status** aparece: **Registered**.

### 2. Ordenador (Softphone MicroSIP)

#### Instalacion de MicroSIP

1. Descargar MicroSIP desde: `https://www.microsip.org/downloads`
2. Ejecutar el instalador:
   - Seleccionar idioma **Espanol** > OK
   - Siguiente > Acepto > Siguiente
   - Seleccionar ubicacion de instalacion > Siguiente
   - Instalar

#### Configurar extension en MicroSIP

1. Pulsar la pestana en la esquina superior derecha.
2. Seleccionar **Anadir nueva**.
3. Rellenar los siguientes campos:

| Campo | Descripcion |
|-------|-------------|
| **Nombre de Cuenta** | Identificador de la extension |
| **Servidor SIP** | Servidor de la centralita |
| **Usuario** | Nombre o numero de registro de la extension (proporcionado por la centralita) |
| **Dominio** | Servidor de la centralita |
| **Iniciar sesion** | Igual que Usuario |
| **Contrasena** | Contrasena de la extension (proporcionada por la centralita) |
| Demas campos | Dejar por defecto |

4. Pulsar **Guardar**.
5. Verificar que en la esquina inferior izquierda aparece **Conectado** en verde.

#### Activar transferencia de llamadas y llamada en espera

1. Pulsar **Ctrl + P** para abrir el menu de ajustes.
2. Desmarcar la opcion **Modo llamada simple**.
3. Pulsar **Guardar**.
4. Se habilitara el modulo para poner llamadas en espera y transferir llamadas.

### 3. Softphone de movil

Las aplicaciones recomendadas son:
- **Linphone** (gratuita)
- **Zoiper** (gratuita)
- **Groundwire** (de pago, 10 EUR pago unico, la mas recomendable)

> **Recomendacion**: Para la configuracion remota, pedir al cliente que instale **AnyDesk** en el movil para conectarse y configurarlo directamente.

#### Configurar extension en softphone movil

1. Abrir la aplicacion y seleccionar **Nueva cuenta SIP**.
2. Rellenar los datos:

| Campo | Descripcion |
|-------|-------------|
| **Titulo** | Identificador de la centralita |
| **Nombre de usuario** | Numero de la extension (proporcionado por la centralita) |
| **Contrasena** | Contrasena proporcionada por la centralita |
| **Dominio** | Servidor de la centralita |

3. Pulsar el **check** en la esquina superior derecha para guardar.

#### Configuracion del terminal Android

Es fundamental configurar los ajustes del movil para que las llamadas entren correctamente:

1. **Permisos de la aplicacion**: Conceder todos los permisos necesarios.
2. **Datos moviles**: Habilitar **Permitir el uso de datos en segundo plano**.
3. **Bateria**: Desactivar la optimizacion de bateria para la aplicacion, de modo que Android no administre su uso y siempre este operativa.
4. **Restricciones**: Asegurarse de que no haya restricciones de bateria ni de segundo plano activas.

---

## FASE V. Verificacion de correcto funcionamiento

Una vez registrada la extension, realizar las siguientes pruebas:

1. **Verificar registro**: Comprobar que la extension esta correctamente registrada en el panel de la centralita o en Asterisk con el comando `SIP SHOW PEERS`.
2. **Pruebas de llamadas**: Realizar llamadas de prueba para comprobar que la extension realiza llamadas correctamente.
3. **Flujo de llamadas**: Verificar que la extension esta en el flujo de llamada correspondiente segun las necesidades del cliente.
4. **CallerID saliente**: Verificar que la extension emite con el numero correcto realizando una llamada a algun numero y comprobando el identificador.
5. **Llamadas internas**: Verificar que en las llamadas internas entre extensiones aparezca el nombre correcto de las extensiones.

---

## FASE VI. Finalizacion de Ticket en JDS

Tras comprobar que la extension fue creada, registrada y probada correctamente, proceder a cerrar la peticion en JDS:

1. **Seguimiento interno**: Rellenar con todos los pasos y avances realizados en el ticket. Esto es lo mas importante para que todos los companeros conozcan el estado de la solicitud.
2. **Solucion**: Dar una descripcion corta de la solucion a la solicitud del cliente.
3. **Enviar correo al cliente**: Confirmar que todo esta correcto.
4. **Cerrar ticket**: Cuando el cliente confirme que todo esta correcto, pulsar **CERRAR**. El estado del ticket quedara en **CERRADO**.
