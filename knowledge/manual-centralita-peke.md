# Manual de Usuario: Centralita Virtual PekePBX

## Acceso a la Centralita

1. Acceder a la centralita a través del siguiente enlace: <https://pbx2.smartgroupcloud.com:1443/#!/login>
2. Introducir las credenciales:
   - **Usuario:** soporte@smartgroup.es
   - **Contraseña:** especificada en el fichero correspondiente
3. Tras acceder, aparecerá el menú principal de la centralita y, a la izquierda, el menú lateral con todas las secciones disponibles.

---

## Panel de Control

En el panel de control se visualizan los datos generales de la centralita:

- Extensiones creadas
- Extensiones conectadas
- Llamadas activas
- Empresas
- DIDs
- Llamadas entrantes y salientes
- Números agregados

---

## DIDs (Numeraciones)

En este apartado se agregan las numeraciones necesarias para la centralita y se revisa el flujo de llamadas.

### Agregar una numeración nueva

1. Pulsar el botón **+**.
2. Rellenar los siguientes campos:
   - **Número:** el número que se desea agregar.
   - **Descripción:** nombre o identificador del número (por ejemplo: "principal", "número de prueba").
   - **Empresa:** seleccionar la empresa a la que va asignada la numeración.
3. Pulsar **GUARDAR** para registrar el número.

### Reglas horarias de entrada de llamadas

Desde el listado de DIDs, al pulsar el icono amarillo se abre una ventana donde es posible crear reglas horarias pulsando **AÑADIR NUEVO**. Los campos disponibles son:

- **Orden:** no se rellena manualmente.
- **Año:** seleccionar el año deseado. Se recomienda usar un punto `.` para abarcar todos los años. Para una fecha específica, seleccionar el año concreto (por ejemplo: 2024).
- **Mes:** preferiblemente usar `.` para todos los meses. Para un mes específico, indicar el valor correspondiente.
- **Día del mes:** usar `.` para todos los días del mes, o indicar el día específico.
- **Día de la semana:** usar `.` para todos los días de la semana, o indicar el día específico.
- **Hora de inicio:** hora de inicio del flujo de llamadas.
- **Hora de fin:** hora final del flujo de llamadas.
- **Destino:** el destino que se asigna en ese horario y fecha al flujo de llamadas.
- **Locución:** si se desea que suene una locución al entrar la llamada, se puede agregar aquí (no es lo más práctico, pero es posible).
- **Descripción:** descripción para organizar el flujo de llamadas.

Una vez rellenados todos los campos, pulsar **AÑADIR** para guardar la regla horaria.

---

## Empresas

En este apartado se verifican las empresas creadas en la PekePBX y se pueden crear nuevas.

### Crear una nueva empresa

1. Pulsar el botón **+**.
2. Rellenar los siguientes campos:
   - **Nombre:** nombre de la empresa.
   - **Número de extensiones:** total de extensiones necesarias (puede modificarse posteriormente según la necesidad del cliente).
   - **Provider:** datos del trunk registrado en la centralita. Estos datos se encuentran en un fichero protegido en una carpeta del servidor.
3. Pulsar **GUARDAR**.

Para acceder a la configuración interna de una empresa, ir al apartado **EMPRESAS**, buscar la empresa y pulsar el icono del ojo para acceder a su menú principal.

---

## Usuarios (Extensiones)

En este apartado se crean y gestionan las extensiones.

### Crear una extensión

1. Pulsar **AÑADIR NUEVO**.
2. Rellenar los siguientes campos:
   - **Rol de usuario:** seleccionar entre "Usuario" o "Administrador".
   - **Email:** correo electrónico del usuario.
   - **Nombre completo:** nombre de la extensión.
   - **Contraseña:** clave del usuario para acceder a la centralita (indicar cualquiera).
   - **Extensión:** numeración de la extensión (por ejemplo: 10).
   - **Permitir solo llamadas internas:** activar si se desea que la extensión solo pueda realizar llamadas internas.
   - **Contraseña SIP:** contraseña de registro SIP de la extensión.
   - **CallerID:** numeración con la que emitirá la extensión.
3. Pulsar **GUARDAR** para registrar la extensión.

Tras guardar, la extensión aparecerá en la ventana de usuarios.

---

## Alias

En este apartado se agregan numeraciones cortas para facilitar las llamadas desde las extensiones.

### Crear un alias

1. Rellenar los siguientes campos:
   - **Número real:** la numeración larga.
   - **Alias:** la numeración corta que se marca desde la extensión para llamar al número real.
   - **Nombre para mostrar:** nombre que se mostrará al llamar a la numeración corta.
   - **Descripción:** descripción de la numeración.
2. Pulsar **GUARDAR**.

---

## Aplicaciones

### Colas

Las colas son un sistema de gestión de llamadas que permite organizar y administrar las llamadas entrantes. Cuando un llamante se conecta a una cola, espera en línea hasta que un agente disponible pueda atender la llamada. Son útiles en entornos con gran volumen de llamadas, como centros de atención al cliente o help desks. Permiten distribuir las llamadas de manera eficiente entre los agentes disponibles.

#### Crear una cola

1. Pulsar **AÑADIR NUEVO**.
2. Rellenar los siguientes campos:
   - **Nombre:** nombre de la cola.
   - **Número:** número de la cola (sirve para transferir una llamada desde una extensión a una cola específica, por ejemplo al departamento de facturación).
   - **Número máximo de llamadas en espera:** dejar en 0 para ilimitadas.
   - **Tiempo máximo de espera antes de saltar a la siguiente prioridad:** tiempo antes de pasar a la siguiente prioridad (puede ser dentro de la misma cola o a su salto).
   - **Tiempo máximo en cola:** tiempo máximo que una llamada permanece dentro de la cola.
   - **Tiempo entre llamadas para agentes:** tiempo que transcurre para saltar la llamada entre agentes de una misma cola.
   - **Usuarios:** extensiones a agregar en la cola.
   - **Auto responder:** marcar si se desea que las llamadas se auto respondan sin que el agente descuelgue.
   - **Llamar a extensiones en uso:** si una extensión está en llamada, al marcar esta opción puede entrar otra llamada en espera en la misma extensión.
   - **Reproducir música de espera:** activa una locución cuando la llamada entra en la cola.
   - **Recordar agente que atiende:** recuerda la extensión que atendió la última llamada.
   - **Mostrar nombre de CallerID:** muestra el nombre de la cola a los agentes cuando reciben una llamada.
   - **Estrategia:**
     - **Todos a la vez:** timbra en todas las extensiones simultáneamente.
     - **Por orden:** salta de extensión en extensión según el orden configurado.
     - **Por orden grupal:** salta de grupo en grupo de extensiones. Por ejemplo, si el primer grupo tiene 2 extensiones, suenan ambas a la vez; tras el tiempo máximo de estrategia, salta al siguiente grupo.
     - **Por orden circular:** salta de extensión en extensión, evitando siempre al último agente que recibió la llamada.
   - **Destino si no es atendido:** destino al que se dirige la llamada tras recorrer toda la cola sin ser atendida.
3. Pulsar **GUARDAR**.

Tras guardar, se puede comprobar que la cola ha sido creada y consultar las estadísticas de llamadas de las colas.

---

### Buzones

Los buzones son destinos a los que salta la llamada cuando no es atendida (por ejemplo, un buzón de voz general).

#### Crear un buzón

1. Rellenar los siguientes campos:
   - **Nombre del buzón:** nombre identificativo del buzón.
   - **Número del buzón:** número identificador. Si se llama directamente a este número desde una extensión, saltará este buzón.
   - **Email:** correo electrónico donde se recibirá el mensaje de voz dejado por el llamante (llega en formato de audio).
   - **Locución:** locución que se reproduce cuando la llamada salta al buzón.
2. Pulsar **GUARDAR**.

---

### Números Externos

En este apartado se agregan numeraciones externas largas (por ejemplo, un móvil o un fijo) para usarlas en el flujo de llamadas de la centralita.

1. Introducir el número externo deseado.
2. Pulsar **GUARDAR**.

---

### IVR (Respuesta de Voz Interactiva)

El IVR es una tecnología de telefonía que permite a los clientes interactuar con el sistema de atención de la compañía a través de menús de voz configurables en tiempo real, utilizando tonos DTMF y sin necesidad de intervención humana.

#### Crear un IVR

1. Pulsar **AÑADIR NUEVO**.
2. Rellenar los siguientes campos:
   - **Nombre del identificador:** nombre del IVR.
   - **Extensión:** número del IVR que se identifica en Asterisk.
   - **Locución:** locución que se reproduce al entrar la llamada en el IVR.
   - **Permitir marcar:** permite que el llamante marque durante la locución. Por ejemplo, si hay una locución con varias opciones y el usuario quiere marcar la opción 5, puede hacerlo directamente. También funciona con extensiones.
   - **Destinos:** opciones que el llamante puede marcar (por ejemplo: marcar 1 para facturación, marcar 2 para soporte, etc.).
   - **Si no se pulsa:** destino al que se dirige la llamada si no se selecciona ninguna opción tras el timeout.
   - **Timeout si no se pulsa:** configuración para repetir el IVR si no se selecciona ninguna opción.
3. Pulsar **GUARDAR**.

---

### Locuciones

En este apartado se suben las locuciones necesarias para el sistema de la centralita (fuera de horario, entrada, ocupado, música de espera, buzón, etc.).

#### Agregar una locución

1. Pulsar **AÑADIR NUEVO**.
2. Rellenar los siguientes campos:
   - **Nombre de identificador:** nombre con el que se identifica la locución.
   - **Locución:** archivo de audio de la locución.
   - **Dato:** la PekePBX admite cualquier formato de audio, pero se recomienda **WAV** o **MP3**.
3. Pulsar **GUARDAR**.

También es posible grabar una locución directamente a través de la centralita, aunque no es la opción más recomendable.

---

### Música en Espera

Es la música que suena cuando la llamada entra en las colas de la centralita. Existe una música por defecto, pero se puede cambiar simplemente subiendo un nuevo archivo de audio.

---

### CDR (Registro Detallado de Llamadas)

El CDR es un registro detallado de las llamadas realizadas a través del sistema. Funciona como un informe o historial que guarda información sobre cada llamada telefónica que pasa por Asterisk.

#### Filtros disponibles

- **Tipo de llamada:** todas, entrantes, salientes o internas.
- **Estado de llamada:** atendidas o no atendidas.
- **Fecha de inicio:** fecha desde la que se desea buscar las llamadas.
- **Fecha de fin:** fecha hasta la que se desea buscar las llamadas.
- **Número:** filtrar por un número específico.

#### Información disponible en el CDR

- Fecha de la llamada
- Duración
- Dirección de la llamada
- Origen y destino
- Grabaciones de las llamadas (si están habilitadas para la empresa), accesibles a través del icono azul de la derecha
- Exportar datos en formato CSV
- Vista de estadísticas interactivas (activando la opción "Estadística")

---

### Videoconferencias

La centralita permite crear reuniones tipo Teams a través de su sistema WebRTC.

#### Crear una sala de conferencias

1. Pulsar **AÑADIR NUEVO**.
2. Asignar un nombre a la sala.
3. Pulsar **GUARDAR**. Se generará un enlace para compartir con los participantes.
4. Opcionalmente, enviar el enlace por correo electrónico a los participantes deseados.

---

### API

Código API utilizado para la integración del sistema con herramientas externas.

---

## Módulos

Los módulos son adaptables a las necesidades del cliente. Para instalar un módulo:

1. Seleccionar el módulo deseado en la opción **CONFIGURAR**.
2. Pulsar **CONFIGURAR NUEVA EMPRESA**.
3. Seleccionar la empresa a la que se desea instalar el módulo.

### Módulos disponibles

- **Homerti CRM:** conecta la PekePBX con el CRM de Homerti a través de un API key.
- **Aplicación móvil:** activa las funciones de la aplicación móvil de la PBX.
- **Extensión de navegador:** activa las funciones de las extensiones del navegador (Chrome y Firefox).
- **Pipedrive:** conexión con Pipedrive a través de un API key.
- **Dolibarr:** conexión con Dolibarr a través de un API key.
- **Llamadas perdidas:** cuando una persona llama a la centralita pero corta antes de ser atendida, se envía un correo electrónico con la llamada perdida y el número que llamó al correo indicado en el módulo.
- **Web Phone:** softphone integrado en la empresa de la centralita. Permite llamar a través de una extensión sin necesidad de un teléfono IP o softphone externo en el móvil u ordenador.
- **HubSpot:** integra HubSpot con la centralita Asterisk a través de un API key.
- **ZOHO:** integra el CRM de ZOHO con la centralita a través de un API key.
- **CUERVA:** integra el CRM de CUERVA con la centralita a través de un API key.
- **DID OUT:** permite configurar un plan de marcación específico para las empresas. Útil para llevar un registro de qué extensiones pueden llamar con ciertos identificadores.
- **Enrutamiento DID:** módulo principal de toda configuración de centralita. Se instala siempre que se crea una empresa, ya que permite flexibilidad con el flujo de llamadas.
- **Módulo de eventos:** utilizado principalmente para restaurantes, permite integrar CoverManager. A través de un API proporcionado por CoverManager, se envía la información de la llamada a su CRM.
- **Permiso de llamadas:** permite establecer restricciones de llamadas a las extensiones deseadas.

Los módulos son importantes para adaptar la centralita a las necesidades propias y las del cliente.

---

## Seguridad

Este apartado del panel de control es importante y ofrece tres opciones:

### Control de Eventos

Muestra los logs de registros en la centralita: cuándo se conecta un usuario, con fecha, hora y datos del registro.

### Lista de Baneos

Permite verificar las IPs que han sido baneadas por la centralita. Normalmente se banea una IP por intento de registro fallido de una extensión (puede ser un ataque o simplemente un usuario introduciendo mal la contraseña en su softphone).

- Para desbanear una IP, pulsar **DESBANEAR IP**.

### Lista Blanca

Son las IPs que se desean autorizar de forma permanente.

- Para agregar una nueva IP, pulsar **AÑADIR NUEVA** y guardarla.
