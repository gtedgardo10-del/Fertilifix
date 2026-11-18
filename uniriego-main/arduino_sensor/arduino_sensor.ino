#include <SoftwareSerial.h>

// Pines Bluetooth -> Arduino Uno
#define BT_RX_PIN 4 // Conectar al TX del módulo Bluetooth
#define BT_TX_PIN 2 // Conectar al RX del módulo Bluetooth

// Pines MAX485 -> Arduino Uno
#define RX_PIN 10   // RO del MAX485
#define TX_PIN 11   // DI del MAX485
#define DE_RE 3     // DE y RE puenteados juntos hacia el Pin 3

SoftwareSerial BluetoothModule(BT_RX_PIN, BT_TX_PIN);
SoftwareSerial rs485(RX_PIN, TX_PIN);

// Trama Modbus RTU: ID 0x01, leer 8 registros desde 0x0000
const byte consulta[] = {0x01, 0x03, 0x00, 0x00, 0x00, 0x08, 0x44, 0x0C};
byte resp[21];

uint16_t crc16(const byte *buf, int len) {
  uint16_t crc = 0xFFFF;
  for (int i = 0; i < len; i++) {
    crc ^= buf[i];
    for (int j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : (crc >> 1);
    }
  }
  return crc;
}

void initBT() {
  BluetoothModule.begin(9600);
  BluetoothModule.setTimeout(100);
}

void handleBT() {
  if (BluetoothModule.available()) {
    String word = BluetoothModule.readString();
    word.trim();
    word.toLowerCase();

    Serial.print("Recibido por BT: ");
    Serial.println(word);

    if (word.equals("start")) {
      BluetoothModule.println(F("Bienvenido a Smart House"));
    }
  }
}

void setup() {
  Serial.begin(9600);
  initBT();

  rs485.begin(9600);
  pinMode(DE_RE, OUTPUT);
  digitalWrite(DE_RE, LOW);

  delay(500);
  BluetoothModule.println(F("Arduino iniciado y listo"));
  Serial.println(F("Arduino iniciado y listo"));
}

void loop() {
  // 1. Atender comandos entrantes por Bluetooth
  BluetoothModule.listen();
  handleBT();

  // 2. Activar escucha en RS485 para la lectura del sensor
  rs485.listen();
  while (rs485.available()) rs485.read();

  // Enviar consulta Modbus
  digitalWrite(DE_RE, HIGH);
  delay(2);
  rs485.write(consulta, sizeof(consulta));
  rs485.flush();
  digitalWrite(DE_RE, LOW);

  unsigned long t0 = millis();
  int idx = 0;
  while (millis() - t0 < 150 && idx < 21) {
    if (rs485.available())
      resp[idx++] = rs485.read();
  }

  // 3. Volver a activar Bluetooth para transmitir
  BluetoothModule.listen();

  if (idx >= 21 && resp[0] == 0x01 && resp[1] == 0x03 && crc16(resp, 19) == (uint16_t)(resp[19] | (resp[20] << 8))) {
    float hum = ((resp[3] << 8) | resp[4]) / 10.0;
    float temp = (int16_t)((resp[5] << 8) | resp[6]) / 10.0;
    int ec = (resp[7] << 8) | resp[8];
    float ph = ((resp[9] << 8) | resp[10]) / 10.0;
    int n = (resp[11] << 8) | resp[12];
    int p = (resp[13] << 8) | resp[14];
    int k = (resp[15] << 8) | resp[16];
    int fert = (resp[17] << 8) | resp[18];

    String json = "{\"hum\":" + String(hum, 1) +
                  ",\"temp\":" + String(temp, 1) +
                  ",\"ec\":" + String(ec) +
                  ",\"ph\":" + String(ph, 1) +
                  ",\"n\":" + String(n) +
                  ",\"p\":" + String(p) +
                  ",\"k\":" + String(k) +
                  ",\"fert\":" + String(fert) + "}";

    Serial.println(json);
    BluetoothModule.println(json);
  } else {
    // Si no respondió el sensor, avisamos para saber qué pasó
    String diag = "Aviso: Sensor RS485 no respondio (bytes recibidos: " + String(idx) + ")";
    Serial.println(diag);
    BluetoothModule.println(diag);
  }

  delay(350); // ~500ms en total por ciclo (150ms lectura + 350ms espera)
}
