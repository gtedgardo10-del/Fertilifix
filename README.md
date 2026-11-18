# Stem

Monitor local de sensores de suelo (humedad, temperatura, EC, pH, N, P, K y fertilidad) con Arduino + RS-485 y panel web en Flask.

## Uso

1. Sube `arduino_sensor/arduino_sensor.ino` a tu Arduino Uno (pines MAX485: RX=10, TX=11, DE/RE=4).
2. Ajusta `ARDUINO_PORT` en `main.py` si no usas `COM3`.
3. Inicia el servidor:

```powershell
uv run main.py
```

Si el Arduino no está conectado, usa datos simulados automáticamente. En el panel web, haz doble clic en el título **Records** para borrar los registros guardados.

## Pruebas

```powershell
uv run python -m unittest test_main.py -v
```
