# Stem

Monitor local de sensores de suelo (humedad, temperatura, EC, pH, N, P, K y lectura FERT del dispositivo) con Arduino + RS-485 y panel web en Flask.

## Uso

1. Sube `arduino_sensor/arduino_sensor.ino` a tu Arduino Uno. Conecta el Bluetooth serial al Arduino en RX=4 y TX=2; conecta el MAX485 en RO=10, DI=11 y DE/RE unidos en el pin 3, como indica el sketch.
2. Empareja el módulo Bluetooth con la computadora y localiza su puerto serial saliente (por ejemplo `COM7` en Windows). Configúralo como `ARDUINO_PORT` en `.env`; el valor predeterminado del proyecto es `COM8`. También puedes usar el puerto USB del Arduino.
3. Desde la carpeta del proyecto, inicia el servidor:

```powershell
uv run main.py
```

Sin una lectura serial válida, el panel muestra el conjunto histórico de prueba y lo marca como tal; no representa mediciones actuales. En el panel web, haz doble clic en el título **Registros** para borrar los registros guardados.

## Asesor Fertilifix

El botón **Ferty Bot** abre una conversación guiada:

1. Indica la planta y la ciudad o municipio donde se encuentra.
2. Indica si la planta está dentro o fuera y si la lluvia puede llegarle.
3. Si la foto no confirmó su estado, el asesor pregunta con opciones observables. Rosa del desierto y tomate tienen guías específicas; para otras especies se usan preguntas generales sin asumir floración o fructificación. Puedes preguntar cómo reconocer el estado antes de elegirlo, o seleccionar **No sé**.
4. Indica el suelo o sustrato. Después puedes consultar las mediciones con el perfil completo y el contexto de las últimas intervenciones.

Los perfiles se guardan automáticamente en el navegador al ingresar la planta y su municipio. En **Mis plantas** puedes volver a seleccionar uno, guardarlo manualmente, cambiarle el nombre o empezar una planta nueva. Los datos guardados incluyen el nombre, especie, lugar y contexto de cultivo; no se guarda la foto ni el historial de conversación. Estos perfiles están disponibles en el mismo navegador y dispositivo; la conversación se reinicia al recargar.

El panel muestra la lectura actual y el promedio de hasta las 30 lecturas recibidas desde que se abrió la página para humedad, temperatura, EC, pH, N, P, K y fertilidad (FERT). Al pulsar una tarjeta se abre su gráfica. No se generan alertas basadas en rangos genéricos para los otros indicadores; la referencia heredada de humedad se describe a continuación.

### Revisión de riego y lluvia

El código original del panel marcaba la humedad fuera del rango visual **45–70%**. Fertilifix conserva esa banda solo para el indicador de humedad: por debajo de 45% activa la recomendación de riego; por encima de 70% resalta que supera la referencia, sin diagnosticar encharcamiento. Es una referencia heredada de la interfaz, no un rango agronómico validado para cada planta y sustrato. La recomendación en vivo indica regar, sin señalar cantidad; las lecturas históricas solo describen lo que habría correspondido en ese momento. Si la planta está afuera expuesta, el asesor consulta las próximas 24 horas en [Open-Meteo](https://open-meteo.com/en/docs) y considera si el pronóstico podría llegar a la maceta; si está bajo techo o dentro, la lluvia no se cuenta como riego. La búsqueda usa el municipio del perfil; las coordenadas se usan solo durante la consulta y no se guardan. El pronóstico es regional y no confirma que llueva justo en la maceta.

### Alcance de las recomendaciones

La pantalla del dispositivo muestra EC en µS/cm, N, P y K en mg/kg, y también entrega su indicador de fertilidad FERT. Según el criterio definido por el usuario para este sensor, **FERT >70** indica fertilidad muy alta y el asesor no recomienda agregar más fertilizante por ahora. En lecturas Bluetooth en vivo, el servidor compara medianas del inicio y final de una ventana móvil de 20 minutos cuando hay al menos seis muestras repartidas en dos minutos o más. Si EC, N, P, K y FERT suben conjuntamente, el asesor destaca esos indicadores como una señal compatible con más sales/nutrientes; no afirma que el fertilizante sea la causa ni calcula dosis. EC resume la conductividad conjunta y no identifica cada nutriente. La banda FERT es una regla operativa del usuario, no un umbral validado ni una dosis agronómica.

Para configurar el proyecto después de clonarlo, copia `.env.example` a `.env` y selecciona el puerto Bluetooth/USB. El archivo `.env` está excluido de Git. Si quieres respuestas de Gemini y análisis de fotos, agrega tu propia clave en ese archivo:

```env
FERTILIX_API_KEY=tu_clave_de_Gemini
FERTILIX_PROVIDER=gemini
FERTILIX_MODEL=gemini-3.8-flash
FERTILIX_VISION_MODEL=gemini-3.5-flash-lite
ARDUINO_PORT=COM7
```

La misma variable `FERTILIX_API_KEY` habilita el chat y el análisis de imágenes en ese dispositivo. Para usar la misma clave en otro dispositivo, crea allí su propio `.env` a partir de `.env.example` y copia la clave; `.env` no se sincroniza ni se sube a GitHub. Sin una clave, el chatbot sigue disponible con respuestas locales basadas en el perfil y las mediciones; Gemini y el escaneo de fotos sí requieren una clave. El análisis de fotos usa Gemini 3.5 Flash-Lite por defecto y conserva modelos de respaldo. `FERTILIX_VISION_MODEL` permite cambiarlo sin alterar el modelo del chatbot. La clave nunca se envía al navegador.

## Pruebas

```powershell
uv run python -B -m unittest test_advisor -v
```
