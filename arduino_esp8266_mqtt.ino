#include <ESP8266WiFi.h>
#include <PubSubClient.h>

// ==========================================
// KONFIGURASI WIFI & MQTT
// ==========================================
const char* ssid = "NAMA_WIFI_ANDA";
const char* password = "PASSWORD_WIFI_ANDA";

const char* mqtt_server = "broker.hivemq.com"; // Bisa pakai broker publik untuk eksperimen (misal: broker.emqx.io, test.mosquitto.org)
const int mqtt_port = 1883;

// Isi jika MQTT broker mewajibkan username & password
const char* mqtt_user = ""; 
const char* mqtt_password = "";

// ==========================================
// KONFIGURASI PIN 
// ==========================================
// Pin untuk Sensor IR (Out dari FC-51 masuk ke pin D1)
const int irSensorPin = D1; 

// Pin untuk Sensor Tegangan Baterai
// Menggunakan Pin A0 untuk membaca tegangan analog (Internal pembacaan tegangan max 3.2V untuk Wemos D1 Mini)
// Wajib menggunakan R-Divider (misal, Resistor 100k + Resistor 22k) untuk baterai Li-Ion 4.2V agar tegangannya turun sebelum masuk D1.
const int batteryPin = A0;  

WiFiClient espClient;
PubSubClient client(espClient);

// Variabel Global
int lastIrState = HIGH;
unsigned long lastBatteryCheck = 0;

void setup() {
  Serial.begin(115200);
  pinMode(irSensorPin, INPUT);
  
  setup_wifi();
  
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Menghubungkan ke WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("");
  Serial.println("WiFi terhubung!");
  Serial.print("Alamat IP: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Menghubungkan ulang ke MQTT Broker...");
    
    // Buat client ID acak
    String clientId = "ESP8266Client-";
    clientId += String(random(0xffff), HEX);
    
    // Coba koneksi ()
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_password)) {
      Serial.println("Berhasil Terhubung!");
      // client.subscribe("topik/perintah/jika_ada");
    } else {
      Serial.print("Gagal, status rc=");
      Serial.print(client.state());
      Serial.println(". Mencoba lagi dalam 5 detik...");
      delay(5000);
    }
  }
}

void callback(char* topic, byte* payload, unsigned int length) {
  // Biarkan kosong jika ESP8266 tidak perlu menerima instruksi kontrol dari dashboard
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // --------------------------------------------------------
  // 1. PEMBACAAN SENSOR IR TANGKAPAN NGENGAT
  // --------------------------------------------------------
  int irState = digitalRead(irSensorPin);
  
  // Jika Sensor bernilai LOW, itu berarti ada halangan/serangga masuk
  if (irState != lastIrState) {
    if (irState == LOW) {
      Serial.println("Seekor serangga/ngengat terdeteksi!");
      
      // Susun Payload JSON
      String payload = "{\"node\": \"Node A (UV 365nm)\", \"status\": \"terdeteksi\"}";
      
      // Kirim ke MQTT
      client.publish("dashboard/ngengat/deteksi", payload.c_str());
    }
    lastIrState = irState;
    delay(300); // Debounce untuk mencegah pembacaan double
  }

  // --------------------------------------------------------
  // 2. PEMBACAAN TEGANGAN BATERAI (Tiap 10 Detik)
  // --------------------------------------------------------
  if (millis() - lastBatteryCheck > 10000) {
    lastBatteryCheck = millis();
    int sensorValue = analogRead(batteryPin);
    
    // Konversi Analog (0-1023) ke persentase & tegangan.
    // Asumsi menggunakan Voltage Divider 100k - 22k untuk Li-Ion max 4.2V
    // Nilai ini perlu dikalibrasi (dikali rasio R1/R2) jika meleset.
    float voltage = sensorValue * (4.2 / 1023.0); 
    
    // Perhitungan % Baterai Li-Ion
    float percentage = ((voltage - 3.3) / (4.2 - 3.3)) * 100.0;
    if (percentage > 100) percentage = 100;
    if (percentage < 0) percentage = 0;
    
    String batPayload = "{\"voltage\": " + String(voltage) + ", \"percentage\": " + String(percentage) + "}";
    client.publish("dashboard/ngengat/baterai", batPayload.c_str());
    
    Serial.print("Baterai: ");
    Serial.print(voltage);
    Serial.print("V (");
    Serial.print(percentage);
    Serial.println("%)");
  }
}
