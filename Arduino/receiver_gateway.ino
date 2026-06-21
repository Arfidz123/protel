/*
 * ============================================================
 * RECEIVER (GATEWAY) - Smart Buoy Rip Current Detection
 * ============================================================
 * 
 * Terima paket dari buoy via LoRa, output ke Serial:
 *   1. Format human-readable (untuk debugging)
 *   2. Format JSON dengan prefix [JSON] (untuk Python bridge)
 * 
 * Hardware: ESP32 + LoRa SX1278 + antena 433 MHz
 * 
 * WIRING:
 *   LoRa: VCC=3.3V, GND, MISO=19, MOSI=23, SCK=18
 *         NSS=5, RST=14, DIO0=2, ANT=antena 433MHz (WAJIB!)
 * 
 * LIBRARY:
 *   - LoRa by Sandeep Mistry
 * 
 * KONEKSI KE LAPTOP:
 *   USB -> laptop -> bridge_hardware.py akan baca data
 */

#include <SPI.h>
#include <LoRa.h>

// ==================== KONFIGURASI ====================

#define LORA_SCK        18
#define LORA_MISO       19
#define LORA_MOSI       23
#define LORA_SS         5
#define LORA_RST        14
#define LORA_DIO0       2

// HARUS SAMA dengan buoy
#define LORA_FREQ       433E6
#define LORA_SF         10
#define LORA_BW         125E3

#define SHOW_JSON         true
#define SHOW_STATS_EVERY  10

// ==================== STRUKTUR PAKET ====================
// HARUS IDENTIK dengan transmitter

struct __attribute__((packed)) BuoyPacket {
  uint8_t  node_id;
  uint32_t packet_num;
  
  // GPS
  float    latitude;
  float    longitude;
  float    gps_speed;
  float    gps_course;
  uint8_t  gps_valid;
  
  // MPU6050 / wave intensity
  float    accel_x;
  float    accel_y;
  float    accel_z;
  float    accel_z_std;
  float    accel_mag_mean;
  float    gyro_mag_mean;
  float    wave_intensity;
  uint8_t  wave_category;
};

// ==================== STATISTIK ====================

uint32_t total_received = 0;
uint32_t received_per_node[4] = {0, 0, 0, 0};
uint32_t gps_fix_count = 0;
unsigned long start_time_ms = 0;

// ==================== SETUP ====================

void setup() {
  Serial.begin(115200);
  delay(500);
  
  Serial.println();
  Serial.println("============================================================");
  Serial.println("  RECEIVER (GATEWAY) - Smart Buoy");
  Serial.println("  Monitoring: Kecepatan, Arah Arus, Keganasan Gelombang");
  Serial.println("============================================================");
  
  Serial.print("[INIT] LoRa... ");
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  
  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("FAILED");
    Serial.println("Cek wiring LoRa, antena terpasang");
    while (1) delay(2000);
  }
  
  LoRa.setSpreadingFactor(LORA_SF);
  LoRa.setSignalBandwidth(LORA_BW);
  LoRa.setCodingRate4(5);
  LoRa.enableCrc();
  Serial.println("OK");
  
  Serial.println();
  Serial.println("[CONFIG]");
  Serial.print("  Frequency : "); Serial.print(LORA_FREQ/1E6); Serial.println(" MHz");
  Serial.print("  SF        : SF"); Serial.println(LORA_SF);
  Serial.print("  Packet    : "); Serial.print(sizeof(BuoyPacket)); Serial.println(" bytes");
  
  Serial.println();
  Serial.println("[READY] Menunggu data dari buoy...");
  Serial.println("============================================================");
  Serial.println();
  
  start_time_ms = millis();
}

// ==================== LOOP ====================

void loop() {
  int packetSize = LoRa.parsePacket();
  if (packetSize == 0) return;
  
  if (packetSize == sizeof(BuoyPacket)) {
    BuoyPacket pkt;
    LoRa.readBytes((uint8_t*)&pkt, sizeof(pkt));
    
    int rssi = LoRa.packetRssi();
    float snr = LoRa.packetSnr();
    
    total_received++;
    if (pkt.node_id >= 1 && pkt.node_id <= 3) received_per_node[pkt.node_id]++;
    if (pkt.gps_valid) gps_fix_count++;
    
    printPacketBox(pkt, rssi, snr);
    if (SHOW_JSON) printPacketJSON(pkt, rssi, snr);
    
    if (total_received % SHOW_STATS_EVERY == 0) printStatistics();
    
  } else {
    Serial.print("[WARN] Paket size mismatch: ");
    Serial.print(packetSize);
    Serial.print(" (expected ");
    Serial.print(sizeof(BuoyPacket));
    Serial.println(")");
    while (LoRa.available()) LoRa.read();
  }
}

// ==================== PRINT BOX ====================

void printPacketBox(const BuoyPacket& pkt, int rssi, float snr) {
  Serial.println();
  Serial.print("+------ Buoy #");
  Serial.print(pkt.node_id);
  Serial.print("  Packet #");
  Serial.print(pkt.packet_num);
  Serial.println(" ------+");
  
  // === ARUS (dari GPS) ===
  if (pkt.gps_valid) {
    Serial.print("|  Pos        : ");
    Serial.print(pkt.latitude, 6); Serial.print(", ");
    Serial.print(pkt.longitude, 6); Serial.println();
    Serial.print("|  ARUS  -> v=");
    Serial.print(pkt.gps_speed, 3); Serial.print(" m/s  arah=");
    Serial.print(pkt.gps_course, 1); Serial.println(" deg");
  } else {
    Serial.println("|  ARUS  -> GPS NO FIX");
  }
  
  // === KEGANASAN GELOMBANG (dari MPU6050) ===
  Serial.print("|  OMBAK -> intensity=");
  Serial.print(pkt.wave_intensity, 2);
  Serial.print(" [");
  if (pkt.wave_category == 0) Serial.print("CALM/Tenang");
  else if (pkt.wave_category == 1) Serial.print("MODERATE/Sedang");
  else Serial.print("ROUGH/Ganas");
  Serial.println("]");
  
  Serial.print("|         accel_z_std=");
  Serial.print(pkt.accel_z_std, 2); Serial.print(" m/s2  ");
  Serial.print("gyro=");
  Serial.print(pkt.gyro_mag_mean, 1); Serial.println(" deg/s");
  
  // === SIGNAL ===
  Serial.print("|  Signal: RSSI=");
  Serial.print(rssi); Serial.print(" dBm  SNR=");
  Serial.print(snr, 1); Serial.print(" dB  [");
  if (rssi > -70) Serial.print("EXCELLENT");
  else if (rssi > -85) Serial.print("GOOD");
  else if (rssi > -100) Serial.print("FAIR");
  else Serial.print("WEAK");
  Serial.println("]");
  
  Serial.println("+--------------------------------+");
}

// ==================== PRINT JSON ====================
// Format yang dibaca Python bridge

void printPacketJSON(const BuoyPacket& pkt, int rssi, float snr) {
  Serial.print("[JSON] {");
  Serial.print("\"node_id\":");        Serial.print(pkt.node_id);
  Serial.print(",\"pkt\":");           Serial.print(pkt.packet_num);
  
  // GPS
  Serial.print(",\"lat\":");           Serial.print(pkt.latitude, 6);
  Serial.print(",\"lon\":");           Serial.print(pkt.longitude, 6);
  Serial.print(",\"gps_speed\":");     Serial.print(pkt.gps_speed, 4);
  Serial.print(",\"gps_course\":");    Serial.print(pkt.gps_course, 2);
  Serial.print(",\"gps_valid\":");     Serial.print(pkt.gps_valid);
  
  // MPU
  Serial.print(",\"ax\":");            Serial.print(pkt.accel_x, 3);
  Serial.print(",\"ay\":");            Serial.print(pkt.accel_y, 3);
  Serial.print(",\"az\":");            Serial.print(pkt.accel_z, 3);
  Serial.print(",\"az_std\":");        Serial.print(pkt.accel_z_std, 3);
  Serial.print(",\"accel_mag\":");     Serial.print(pkt.accel_mag_mean, 3);
  Serial.print(",\"gyro_mag\":");      Serial.print(pkt.gyro_mag_mean, 2);
  Serial.print(",\"wave_intensity\":"); Serial.print(pkt.wave_intensity, 3);
  Serial.print(",\"wave_category\":"); Serial.print(pkt.wave_category);
  
  // Signal
  Serial.print(",\"rssi\":");          Serial.print(rssi);
  Serial.print(",\"snr\":");           Serial.print(snr, 1);
  Serial.println("}");
}

// ==================== STATISTIK ====================

void printStatistics() {
  unsigned long uptime = (millis() - start_time_ms) / 1000;
  
  Serial.println();
  Serial.println("============================================================");
  Serial.println("  STATISTICS");
  Serial.println("============================================================");
  Serial.print("  Uptime        : "); Serial.print(uptime); Serial.println("s");
  Serial.print("  Total packets : "); Serial.println(total_received);
  if (total_received > 0) {
    Serial.print("  GPS fix rate  : ");
    Serial.print(100.0 * gps_fix_count / total_received, 1);
    Serial.println("%");
  }
  Serial.println("  Per buoy:");
  for (int i = 1; i <= 3; i++) {
    Serial.print("    Buoy #"); Serial.print(i);
    Serial.print(" : "); Serial.print(received_per_node[i]);
    Serial.println(" packets");
  }
  Serial.println("============================================================");
  Serial.println();
}
