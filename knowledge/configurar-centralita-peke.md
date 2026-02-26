# Procedimiento: Alta de Cliente Nuevo en Centralita Virtual PekePBX

**Departamento de Soporte Tecnico**

---

## 1. Acceso a la Centralita PekePBX

Para la creacion de una centralita virtual en la PekePBX, accedemos a traves del siguiente enlace:

- **URL**: https://pbx2.smartgroupcloud.com:1443/#!/login
- **Usuario**: soporte@smartgroup.es
- **Password**: apuntada en fichero protegido en el servidor.

---

## 2. Menu Principal de la Centralita

### Menu Lateral

- **Panel de Control**: Muestra los datos de la centralita: extensiones conectadas, llamadas activas, empresas, DIDs, extensiones, llamadas entrantes, llamadas salientes, etc.
- **Empresas**: Permite verificar las empresas creadas en la PekePBX y crear nuevas.

---

## 3. Creacion de una Nueva Empresa

En el apartado **Empresas**, seleccionar el boton **+** para crear una nueva empresa. Rellenar los siguientes campos:

1. **Nombre**: El nombre que llevara la empresa.
2. **Numero de Extensiones**: El numero total de extensiones que necesita el cliente (se puede modificar posteriormente segun la necesidad).
3. **Provider**: Datos del trunk que tiene registrado la centralita. Estos datos se encuentran en un fichero protegido en una carpeta del servidor.

Pulsar **Guardar** para crear la empresa.

### Verificacion

Para verificar que la empresa se creo correctamente, ir al apartado **Empresas**, buscar el nombre de la empresa creada y confirmar que existe.

---

## 4. Configuracion de DIDs (Numeraciones)

En el apartado **DIDs**, agregamos las numeraciones necesarias para la centralita. En un primer paso, agregar la numeracion de prueba. Tambien se pueden agregar las numeraciones finales del cliente.

Para agregar una nueva numeracion, seleccionar el boton **+** y rellenar:

1. **Numero**: El numero que queremos agregar.
2. **Descripcion**: Nombre o identificador del numero (por ejemplo: "principal", "numero de prueba", etc.).
3. **Empresa**: Seleccionar la empresa a la que va asignada la numeracion.

Pulsar **Guardar** para almacenar el numero.

---

## 5. Acceso a la Configuracion Interna de la Empresa

Para acceder a la empresa y configurarla internamente, ir al apartado **Empresas**, buscar la empresa y pulsar el icono del **ojo**.

### Menu Principal de la Empresa

- **Panel de Control**: Estadisticas de llamadas de la empresa (salientes, entrantes, minutos entrantes, minutos salientes, extensiones creadas, extensiones conectadas, numeros agregados).
- **Apariencia**: Modificar la apariencia de la empresa (logo, color del panel).
- **DIDs**: Numeraciones agregadas del cliente y configuracion del flujo de llamadas.

---

## 6. Configuracion del Flujo de Llamadas (DIDs)

Acceder al icono amarillo en el DID para configurar el flujo de llamadas. Seleccionar **Anadir nuevo** para crear una regla horaria. Rellenar los siguientes campos:

1. **Orden**: No rellenar.
2. **Ano**: Seleccionar el ano deseado. **Consejo**: Poner un `.` (punto) para abarcar todos los anos. Para una fecha especifica, seleccionar el ano (ejemplo: 2024).
3. **Mes**: Preferiblemente poner `.` para todos los meses. Para un mes especifico, usar formato `01`, `02`, etc.
4. **Dia del mes**: Poner `.` para todos los dias del mes. Para un dia especifico, usar la nomenclatura correspondiente.
5. **Dia de la semana**: Poner `.` para todos los dias de la semana. Para dias especificos, usar la nomenclatura correspondiente.
6. **Hora de Inicio**: Hora de inicio del flujo de llamadas.
7. **Hora de Fin**: Hora final del flujo de llamadas.
8. **Destino**: El destino que queremos asignar en ese horario y fecha al flujo de llamadas.
9. **Locucion**: Opcionalmente, agregar una locucion que suene al entrar la llamada.
10. **Descripcion**: Descripcion para organizar el flujo de llamadas.

Pulsar **Anadir** para guardar la regla horaria.

---

## 7. Creacion de Usuarios (Extensiones)

En el apartado **Usuarios**, seleccionar **Anadir nuevo** para crear una extension. Rellenar los siguientes campos:

1. **Rol de Usuario**: Seleccionar entre "Usuario" o "Administrador".
2. **Email**: Correo electronico del usuario.
3. **Nombre Completo**: Nombre de la extension.
4. **Contrasena**: Contrasena para acceso del usuario a la centralita (poner cualquiera).
5. **Extension**: Numero de la extension (ejemplo: 10).
6. **Permitir solo llamadas internas**: Marcar si la extension solo debe hacer llamadas internas (sin llamadas externas).
7. **Contrasena SIP**: Contrasena de registro SIP de la extension.
8. **CallerID**: Numeracion con la que emitira la extension.

Pulsar **Guardar** para crear la extension.

---

## 8. Alias (Numeracion Corta)

En el apartado **Alias** se agregan numeraciones cortas que se pueden marcar desde las extensiones. Rellenar:

1. **Numero Real**: La numeracion larga original.
2. **Alias**: La numeracion corta que se marca desde la extension para llamar al numero real.
3. **Nombre para mostrar**: El nombre que se mostrara al llamar a la numeracion corta.
4. **Descripcion**: Descripcion de la numeracion.

Pulsar **Guardar**.

---

## 9. Aplicaciones

### 9.1. Colas

Las colas son un sistema de gestion de llamadas que permite organizar y administrar las llamadas entrantes. Cuando un llamante se conecta a una cola, espera en linea hasta que un agente disponible pueda atender la llamada. Son utiles en entornos con muchas llamadas (centros de atencion al cliente, help desks).

Para crear una cola, pulsar **Anadir nuevo** y rellenar:

1. **Nombre**: Nombre de la cola.
2. **Numero**: Numero de la cola (util para transferir llamadas a una cola especifica, por ejemplo, el departamento de facturacion).
3. **Numero maximo de llamadas en espera**: Dejar en `0` para ilimitadas.
4. **Tiempo maximo de espera antes de saltar a la siguiente prioridad**: Tiempo antes de pasar a la siguiente prioridad (dentro de la misma cola o a su salto).
5. **Tiempo maximo en cola**: Tiempo maximo que un llamante permanece dentro de la cola.
6. **Tiempo entre llamadas para Agentes**: Tiempo que pasa para saltar la llamada entre agentes de una misma cola.
7. **Usuarios**: Extensiones que queremos agregar en la cola.
8. **Auto responder**: Marcar si queremos que las llamadas se auto respondan sin necesidad de que el agente descuelgue.
9. **Llamar a extensiones en uso**: Si una extension esta en llamada, marcando esta opcion puede entrar otra llamada en espera en la misma extension.
10. **Reproducir musica de espera**: Reproduce una locucion cuando entra la llamada en la cola.
11. **Recordar agente que atiende**: Recuerda la extension que atendio la ultima llamada.
12. **Mostrar Nombre de CallerID**: Muestra el nombre de la cola en los agentes cuando reciben una llamada.

#### Estrategias de la Cola

1. **Todos a la vez**: Timbra en todas las extensiones a la vez.
2. **Por Orden**: Salta de extension en extension segun el orden configurado.
3. **Por Orden grupal**: Salta de grupo de extensiones en grupo. Si el primer grupo tiene 2 extensiones, suenan ambas a la vez; luego del tiempo maximo de estrategia, salta al siguiente grupo.
4. **Por orden circular**: Salta de extension en extension, evitando siempre al ultimo que recibio la llamada.

**Destino si no es atendido**: Es el salto que hara la cola luego de completar todo el recorrido. Se puede colocar cualquier destino.

Pulsar **Guardar** para crear la cola.

### 9.2. Buzones

Si no se atienden las llamadas, pueden saltar a un buzon de voz. Rellenar:

1. **Nombre del buzon**: Nombre identificador del buzon.
2. **Numero del buzon**: Numero identificador. Si se llama directamente a este numero desde una extension, saltara el buzon.
3. **Email**: Correo donde llegara el mensaje de voz que deje el llamante (llega como archivo de audio).
4. **Locucion**: Locucion que se reproduce cuando la llamada salta al buzon.

Pulsar **Guardar**.

### 9.3. Numeros Externos

En este apartado se agregan numeraciones externas largas (movil, fijo, etc.) que se pueden usar en el flujo de llamadas de la centralita. Pulsar **Guardar** despues de agregarlos.

### 9.4. IVRs (Respuesta de Voz Interactiva)

La Respuesta de Voz Interactiva (IVR) es una tecnologia de telefonia que permite a los clientes interactuar con el sistema de atencion de la compania a traves de menus de voz configurables en tiempo real, utilizando tonos DTMF, sin necesidad de intervencion humana.

Para crear un IVR, rellenar:

1. **Nombre del identificador**: Nombre del IVR.
2. **Extension**: Numero del IVR que se identifica en el Asterisk.
3. **Locucion**: Locucion que se reproduce al entrar la llamada en el IVR.
4. **Permitir Marcar**: Permite al llamante marcar durante la locucion (por ejemplo, si hay varias opciones y el usuario quiere marcar directamente la opcion 5, o una extension especifica).
5. **Destinos**: Opciones que el llamante puede marcar. Por ejemplo, para comunicarse con facturacion marcando el 1, se configura en el destino 1, y asi sucesivamente.
6. **Si no se pulsa**: Destino al que se redirige si el llamante no selecciona ninguna opcion despues del timeout.
7. **Timeout si no se pulsa**: Hace que se repita el IVR si no se selecciona ninguna opcion.

Pulsar **Guardar**.

### 9.5. Locuciones

En este apartado se suben las locuciones necesarias para la centralita: fuera de horario, entrada, ocupado, musica de espera, buzon, etc.

Para agregar una locucion nueva, pulsar **Anadir nuevo** y rellenar:

1. **Nombre de identificador**: Nombre con el que se identifica la locucion.
2. **Locucion**: Archivo de audio de la locucion.

> **Nota**: La PekePBX admite cualquier formato de archivo de audio, pero es recomendable usar **WAV** o **MP3**.

Tambien se puede grabar una locucion a traves de la propia centralita, aunque no es la mejor opcion.

### 9.6. Musica en Espera

Musica que se reproduce cuando una llamada entra en las colas de la centralita. Por defecto tiene una, pero se puede cambiar subiendo un nuevo archivo de audio.

---

## 10. CDR (Registro de Llamadas)

El CDR (Call Detail Record) es un registro detallado de todas las llamadas que pasan por el sistema. Funciona como un historial que guarda informacion sobre cada llamada telefonica.

### Filtros disponibles

- **Tipo de llamadas**: Todas, entrantes, salientes o internas.
- **Estado de llamada**: Atendidas o no atendidas.
- **Fecha de inicio**: Fecha desde la que buscar llamadas.
- **Fecha fin**: Fecha hasta la que buscar llamadas.
- **Numero**: Filtrar por un numero especifico.

### Informacion del CDR

Se puede verificar: fecha de la llamada, duracion, direccion, origen y destino. Tambien se pueden:

- Escuchar las grabaciones de las llamadas (si estan habilitadas) pulsando el icono azul de la derecha.
- Descargar un CSV con los datos de las llamadas.
- Ver estadisticas de forma interactiva marcando la opcion **Estadistica**.

---

## 11. Videoconferencias

La centralita permite crear reuniones tipo Teams a traves de un sistema WebRTC. Para crear una sala de conferencias:

1. Pulsar **Anadir nuevo**.
2. Asignar un nombre a la sala.
3. Al guardar, se generara un enlace para compartir con los participantes.

Se puede enviar el enlace por correo electronico.

---

## 12. API

API para la integracion del sistema con herramientas externas.

---

## 13. Modulos

La centralita PekePBX tiene una gran cantidad de modulos opcionales que se pueden adaptar segun las necesidades de cada cliente.

### Como instalar un modulo

En el Panel de Control principal del usuario administrador, ir al apartado **Modulos**. Seleccionar el modulo deseado en la opcion **Configurar** > **Configurar nueva empresa** > seleccionar la empresa a la que instalar el modulo.

### Lista de Modulos

1. **Homerti CRM**: Conecta Asterisk/PekePBX con el CRM de Homerti a traves de un API key.
2. **Aplicacion movil**: Activacion de las funciones de la aplicacion movil de PBX.
3. **Extension de navegador**: Activacion de las funciones de las extensiones del navegador (Chrome y Firefox).
4. **Pipedrive**: Conexion con Pipedrive a traves de un API key.
5. **Dolibarr**: Conexion con Dolibarr a traves de un API key.
6. **Llamadas Perdidas**: Cuando una persona llama a la centralita pero cuelga antes de ser atendida, se envia un correo electronico con la informacion de la llamada perdida y el numero al correo indicado en el modulo.
7. **Web Phone**: Softphone integrado en la empresa de la centralita. Permite llamar a traves de una extension sin necesidad de un telefono IP o Softphone en movil u ordenador.
8. **HubSpot**: Integracion con HubSpot a traves de un API key.
9. **ZOHO**: Integracion con el CRM de ZOHO a traves de un API key.
10. **CUERVA**: Integracion con el CRM de CUERVA a traves de un API key.
11. **DID OUT**: Permite configurar un plan de marcacion especifico para las empresas. Sirve para llevar un registro de que extensiones pueden llamar con ciertos identificadores.
12. **Enrutamiento DID**: **Se instala siempre que se crea una empresa**. Es el modulo principal de toda configuracion de centralita, ya que permite flexibilidad con el flujo de llamadas.
13. **Modulo de Eventos**: Usado principalmente para restaurantes. Permite integrar Covermanager a traves de un API para enviar informacion de llamadas a su CRM.
14. **Permiso de llamadas**: Permite poner restricciones de llamadas a las extensiones que se deseen.

> **Importante**: Los modulos son fundamentales para adaptar la centralita a las necesidades del equipo y del cliente.

---

## 14. Seguridad

El apartado de seguridad en el panel de control es muy importante. Tiene 3 secciones:

### 14.1. Control de Eventos

Muestra los logs de registros en la centralita: cuando se loga un usuario, con fecha, hora y datos del registro.

### 14.2. Lista de Baneos

Permite verificar las IPs que han sido baneadas por la centralita. Normalmente se banea una IP por intento de registro fallido de una extension (puede ser un ataque o un usuario poniendo mal la contrasena en su Softphone).

Para desbanear una IP, simplemente pulsar **Desbanear IP**.

### 14.3. Lista Blanca

IPs que queremos que esten siempre autorizadas. Para agregar una, pulsar **Anadir nueva** y guardar.

---

## 15. Pruebas de la Centralita con el Cliente

Luego de realizar toda la configuracion solicitada por el cliente, se monta un escenario de pruebas:

1. **Configuracion de extensiones**: En Softphone, telefonos fijos Yealink o Web Phone, segun las necesidades del cliente (existe un manual de configuracion para las extensiones).
2. **Despliegue de telefonos de prueba**: Si el cliente necesita telefonos fijos, el equipo de oficina tecnica acudira a sus oficinas para realizar la instalacion.
3. **Datos para pruebas**: Se envian al cliente todos los datos para testear la centralita (numeros de prueba, numeros de extensiones, etc.).
4. **Formacion sobre la centralita**: Si el cliente lo desea, se puede realizar formacion presencial o telematica sobre el uso de telefonos fijos, Softphone y funciones basicas de la centralita a nivel de interfaz web.
5. **Soporte tecnico**: Se informa al cliente que dispone de soporte tecnico a traves de:
   - **Email**: soporte@smartgroup.es
   - **Telefono**: 917 374 206

El cliente realizara las pruebas pertinentes. Si detecta algun fallo o quiere modificar algo, lo comunicara a traves del correo mencionado.

---

## 16. Puesta en Produccion de la Centralita

Una vez completadas las pruebas y recibido el visto bueno del cliente:

1. **Verificar que todo este correcto**: Comprobar que el flujo de llamadas, horarios, extensiones, etc., estan configurados segun lo solicitado.
2. **Agregar los numeros principales del cliente**: Copiar el comportamiento de los numeros de prueba a los numeros reales. Se recomienda hacerlo 1 dia antes de la portabilidad. La portabilidad la gestiona el departamento comercial y avisan con 1 dia de antelacion.
3. **Verificacion post-portabilidad**: Comprobar que las numeraciones son correctas y el flujo de llamadas funciona correctamente. Una vez portados los numeros, el cliente ya estara trabajando con la centralita en produccion.
4. **Soporte post-produccion**: Ante cualquier incidencia, el cliente debe contactar:
   - **Email**: soporte@smartgroup.es
   - **Telefono**: 917 374 206

---

## 17. Finalizacion del Ticket en JDS

Luego de comprobar con el cliente que la centralita en produccion funciona correctamente, se procede a cerrar el ticket en JDS:

1. **Seguimiento interno**: Rellenar con todos los pasos avanzados en el ticket. Esto es lo mas importante para que todos los companeros sepan en que estado esta la solicitud.
2. **Solucion**: Dar una descripcion corta de la solucion a la solicitud del cliente.
3. **Enviar correo al cliente**: Confirmar que todo esta correcto.
4. **Cerrar el ticket**: Cuando el cliente confirme que todo esta bien, pulsar **CERRAR**. El estado del ticket quedara como **CERRADO**.
