/*
 * ============================================================
 * TRANSMITTER (BUOY) - Smart Buoy Rip Current Detection
 * ============================================================
 * 
 * OBJEKTIF SISTEM:
 *   1. Kecepatan arus     -> dari GPS gps_speed (m/s)
 *   2. Arah arus          -> dari GPS gps_course (derajat 0-360)
 *   3. Keganasan gelombang -> dari MPU6050 (wave_intensity)
 * 
 * Hardware: ESP32 + MPU6050 + GPS NEO-6M + LoRa SX1278
 * 
 * WIRING:
 *   MPU6050 (I2C):
 *     VCC=3.3V, GND, SDA=GPIO21, SCL=GPIO22
 * 
 *   GPS NEO-6M (UART2):
 *     VCC=3.3V (max 3.6V), GND, TX=GPIO16, RX=GPIO17
 * 
 *   LoRa SX1278 (SPI):
 *     VCC=3.3V, GND, MISO=19, MOSI=23, SCK=18
 *     NSS=5, RST=14, DIO0=2, ANT=antena 433MHz (WAJIB!)
 * 
 * MULTI-BUOY: 
 *   Ubah NODE_ID ke 1, 2, atau 3 sebelum upload.
 *   Sekarang Anda baru punya 1 buoy, set NODE_ID = 1.
 * 
 * LIBRARY (install via Arduino Library Manager):
 *   - MPU6050 by Electronic Cats
 *   - TinyGPSPlus by Mikal Hart
 *   - LoRa by Sandeep Mistry
 * 
 * CARA KERJA:
 *   - Sensor MPU6050 di-sampling cepat (10 Hz) selama 1 detik
 *   - Hitung wave intensity dari standar deviasi accel & gyro
 *   - Baca GPS untuk kecepatan & arah arus
 *   - Kirim semua data via LoRa tiap 1 detik
 */

#include <Wire.h>
#include <MPU6050.h>
#include <SPI.h>
#include <LoRa.h>
#include <TinyGPSPlus.h>
#include <HardwareSerial.h>
#include <math.h>

// ==================== KONFIGURASI ====================

#define NODE_ID         1       // <<< UBAH untuk multi-buoy (1, 2, atau 3)

// LoRa
#define LORA_SCK        18
#define LORA_MISO       19
#define LORA_MOSI       23
#define LORA_SS         5
#define LORA_RST        14
#define LORA_DIO0       2
#define LORA_FREQ       433E6
#define LORA_SF         10
#define LORA_BW         125E3
#define LORA_POWER      17

// GPS
#define GPS_RX_PIN      16
#define GPS_TX_PIN      17
#define GPS_BAUD        9600

// Sampling & Multi-Buoy Timing
// 3 buoy share 1 detik window = tiap buoy slot 500ms
// SEND_INTERVAL 1500ms supaya total cycle = 1.5 detik (safe untuk SF10)
// Buoy 1 kirim di waktu T, Buoy 2 di T+500ms, Buoy 3 di T+1000ms
#define SEND_INTERVAL_MS    1500    // kirim tiap 1.5 detik per buoy
#define STAGGER_DELAY_MS    500     // delay antar buoy (1500 / 3 = 500ms)
#define MPU_SAMPLE_HZ       10      // sampling MPU 10 Hz
#define MPU_SAMPLES_BUFFER  15      // buffer untuk wave intensity (15 sample dalam 1.5 detik)

// Konstanta MPU6050
#define ACCEL_SCALE     16384.0     // 1g = 16384 (FS_SEL=0, +/-2g)
#define GYRO_SCALE      131.0       // 1 deg/s = 131 (FS_SEL=0, +/-250 deg/s)
#define G_TO_MS2        9.80665

// Kalibrasi MPU
#define CALIB_SAMPLES   200

// ==================== GLOBAL ====================

MPU6050 mpu;
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

unsigned long last_send_ms = 0;
unsigned long last_mpu_sample_ms = 0;
uint32_t packet_counter = 0;

int16_t accel_bias_x = 0, accel_bias_y = 0, accel_bias_z = 0;
int16_t gyro_bias_x = 0, gyro_bias_y = 0, gyro_bias_z = 0;

// Buffer untuk sampling MPU dalam 1 detik
float accel_z_buffer[MPU_SAMPLES_BUFFER];
float accel_mag_buffer[MPU_SAMPLES_BUFFER];
float gyro_mag_buffer[MPU_SAMPLES_BUFFER];
int sample_idx = 0;

// ==================== STRUKTUR PAKET ====================
// HARUS IDENTIK dengan receiver/gateway

struct __attribute__((packed)) BuoyPacket {
  uint8_t  node_id;          // 1 byte
  uint32_t packet_num;       // 4 bytes
  
  // GPS - KECEPATAN & ARAH ARUS (fitur utama)
  float    latitude;         // 4 bytes
  float    longitude;        // 4 bytes
  float    gps_speed;        // 4 bytes  m/s    - KECEPATAN ARUS
  float    gps_course;       // 4 bytes  derajat - ARAH ARUS
  uint8_t  gps_valid;        // 1 byte
  
  // MPU6050 - TINGKAT KEGANASAN GELOMBANG
  float    accel_x;          // 4 bytes  m/s2 (last reading)
  float    accel_y;          // 4 bytes
  float    accel_z;          // 4 bytes
  float    accel_z_std;      // 4 bytes  std dev accel_z (intensitas vertikal)
  float    accel_mag_mean;   // 4 bytes  rata-rata magnitude accel
  float    gyro_mag_mean;    // 4 bytes  rata-rata magnitude gyro
  float    wave_intensity;   // 4 bytes  KEGANASAN GELOMBANG (skor)
  uint8_t  wave_category;    // 1 byte   0=Calm, 1=Moderate, 2=Rough
};
// Total: 50 bytes

// ==================== SETUP ====================

void setup() {
  Serial.begin(115200);
  delay(2000);   // delay lebih lama supaya Serial Monitor ready
  
  Serial.println();
  Serial.println("============================================================");
  Serial.print("  TRANSMITTER (BUOY) #");
  Serial.println(NODE_ID);
  Serial.println("  Mengukur: Kecepatan Arus, Arah Arus, Keganasan Gelombang");
  Serial.println("============================================================");
  
  // Init I2C dengan clock speed lebih rendah (100kHz lebih stabil)
  Wire.begin(21, 22);
  Wire.setClock(100000);  // 100 kHz - lebih stabil di breadboard
  delay(100);
  
  // Init MPU6050 dengan retry mechanism
  Serial.print("[INIT] MPU6050");
  bool mpu_ok = false;
  for (int attempt = 1; attempt <= 5; attempt++) {
    mpu.initialize();
    delay(100);  // beri waktu MPU untuk siap setelah initialize
    
    if (mpu.testConnection()) {
      mpu_ok = true;
      break;
    }
    Serial.print(".");
    delay(200);
  }
  
  if (mpu_ok) {
    Serial.println(" OK");
    mpu.setFullScaleAccelRange(MPU6050_ACCEL_FS_2);   // +-2g
    mpu.setFullScaleGyroRange(MPU6050_GYRO_FS_250);   // +-250 deg/s
    delay(50);
  } else {
    Serial.println(" GAGAL setelah 5 percobaan");
    Serial.println("[WARN] MPU tidak responsif, tapi terdeteksi di I2C.");
    Serial.println("       Tetap lanjut, data MPU mungkin tidak akurat.");
    // TIDAK while(1) lagi - tetap lanjut walaupun MPU bermasalah
  }
  
  // Init GPS
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("[OK] GPS UART2 @ 9600 baud");
  
  // Kalibrasi MPU
  Serial.println();
  Serial.println("=== KALIBRASI MPU6050 ===");
  Serial.println("Letakkan sensor DIAM dan DATAR (mulai dalam 3 detik)...");
  delay(3000);
  calibrateMPU();
  
  // Init LoRa
  Serial.println();
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  
  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("[ERROR] LoRa GAGAL!");
    Serial.println("Cek wiring & antena terpasang");
    while (1) delay(2000);
  }
  
  LoRa.setSpreadingFactor(LORA_SF);
  LoRa.setSignalBandwidth(LORA_BW);
  LoRa.setTxPower(LORA_POWER);
  LoRa.setCodingRate4(5);
  LoRa.enableCrc();
  Serial.println("[OK] LoRa: 433 MHz, SF10, BW125");
  
  Serial.print("[INFO] Packet size: "); 
  Serial.print(sizeof(BuoyPacket)); 
  Serial.println(" bytes");
  
  Serial.println();
  Serial.println("============================================================");
  Serial.println("Mulai sampling sensor dan kirim data tiap 1.5 detik");
  Serial.println("GPS akan NO FIX sampai dapat sinyal (~32 detik outdoor)");
  Serial.print("[TIME-STAGGER] Slot Buoy #");
  Serial.print(NODE_ID);
  Serial.print(": offset ");
  Serial.print((NODE_ID - 1) * STAGGER_DELAY_MS);
  Serial.println(" ms");
  Serial.println("============================================================");
  Serial.println();
  
  // Inisialisasi buffer
  for (int i = 0; i < MPU_SAMPLES_BUFFER; i++) {
    accel_z_buffer[i] = 0;
    accel_mag_buffer[i] = 0;
    gyro_mag_buffer[i] = 0;
  }
  
  // === TIME STAGGERING ===
  // Tiap buoy delay berbeda di awal supaya tidak collision LoRa
  // Buoy 1: delay 0     ms (langsung kirim)
  // Buoy 2: delay 500   ms
  // Buoy 3: delay 1000  ms
  // Setelah delay awal, tiap buoy kirim dengan interval sama (1500ms)
  // sehingga tetap punya slot waktu sendiri
  unsigned long stagger = (NODE_ID - 1) * STAGGER_DELAY_MS;
  if (stagger > 0) {
    Serial.print("Menunggu slot waktu (");
    Serial.print(stagger);
    Serial.println(" ms)...");
    delay(stagger);
  }
  
  last_send_ms = millis();
}

// ==================== KALIBRASI MPU ====================

void calibrateMPU() {
  Serial.print("Mengambil "); 
  Serial.print(CALIB_SAMPLES); 
  Serial.print(" sample");
  
  long sum_ax = 0, sum_ay = 0, sum_az = 0;
  long sum_gx = 0, sum_gy = 0, sum_gz = 0;
  int16_t ax, ay, az, gx, gy, gz;
  
  for (int i = 0; i < CALIB_SAMPLES; i++) {
    mpu.getAcceleration(&ax, &ay, &az);
    mpu.getRotation(&gx, &gy, &gz);
    sum_ax += ax; sum_ay += ay; sum_az += az;
    sum_gx += gx; sum_gy += gy; sum_gz += gz;
    delay(10);
    if (i % 50 == 0) Serial.print(".");
  }
  Serial.println();
  
  accel_bias_x = sum_ax / CALIB_SAMPLES;
  accel_bias_y = sum_ay / CALIB_SAMPLES;
  accel_bias_z = (sum_az / CALIB_SAMPLES) - (int16_t)ACCEL_SCALE;  // bias dari 1g
  gyro_bias_x = sum_gx / CALIB_SAMPLES;
  gyro_bias_y = sum_gy / CALIB_SAMPLES;
  gyro_bias_z = sum_gz / CALIB_SAMPLES;
  
  Serial.println("Kalibrasi MPU6050 selesai!");
}

// ==================== READ MPU SAMPLE ====================
// Dipanggil tiap 100ms dalam loop (= 10 Hz sampling)

void readMPUSample() {
  int16_t ax, ay, az, gx, gy, gz;
  mpu.getAcceleration(&ax, &ay, &az);
  mpu.getRotation(&gx, &gy, &gz);
  
  // Konversi ke m/s² (accel) dan deg/s (gyro), dengan bias correction
  float a_x = ((float)(ax - accel_bias_x) / ACCEL_SCALE) * G_TO_MS2;
  float a_y = ((float)(ay - accel_bias_y) / ACCEL_SCALE) * G_TO_MS2;
  float a_z = ((float)(az - accel_bias_z) / ACCEL_SCALE) * G_TO_MS2;
  float g_x = (float)(gx - gyro_bias_x) / GYRO_SCALE;
  float g_y = (float)(gy - gyro_bias_y) / GYRO_SCALE;
  float g_z = (float)(gz - gyro_bias_z) / GYRO_SCALE;
  
  // Hitung magnitude
  // accel magnitude: jarak euclidian dari (ax, ay, az) - gravity
  // Untuk simplisitas: accel total dikurangi gravitasi
  float accel_mag = sqrt(a_x*a_x + a_y*a_y + a_z*a_z);
  float accel_dyn = fabs(accel_mag - G_TO_MS2);  // dynamic (non-gravity) component
  
  // gyro magnitude
  float gyro_mag = sqrt(g_x*g_x + g_y*g_y + g_z*g_z);
  
  // Simpan ke buffer (circular)
  accel_z_buffer[sample_idx] = a_z;
  accel_mag_buffer[sample_idx] = accel_dyn;
  gyro_mag_buffer[sample_idx] = gyro_mag;
  sample_idx = (sample_idx + 1) % MPU_SAMPLES_BUFFER;
}

// ==================== WAVE INTENSITY ====================

void calculateWaveIntensity(float &accel_z_std, float &accel_mag_mean, 
                            float &gyro_mag_mean, float &wave_score,
                            uint8_t &category) {
  // 1. Standar deviasi accel_z (intensitas gerakan vertikal)
  float sum_z = 0;
  for (int i = 0; i < MPU_SAMPLES_BUFFER; i++) sum_z += accel_z_buffer[i];
  float mean_z = sum_z / MPU_SAMPLES_BUFFER;
  
  float sum_sq = 0;
  for (int i = 0; i < MPU_SAMPLES_BUFFER; i++) {
    float diff = accel_z_buffer[i] - mean_z;
    sum_sq += diff * diff;
  }
  accel_z_std = sqrt(sum_sq / MPU_SAMPLES_BUFFER);
  
  // 2. Rata-rata magnitude accel (dinamic)
  float sum_acc = 0;
  for (int i = 0; i < MPU_SAMPLES_BUFFER; i++) sum_acc += accel_mag_buffer[i];
  accel_mag_mean = sum_acc / MPU_SAMPLES_BUFFER;
  
  // 3. Rata-rata magnitude gyro
  float sum_gyro = 0;
  for (int i = 0; i < MPU_SAMPLES_BUFFER; i++) sum_gyro += gyro_mag_buffer[i];
  gyro_mag_mean = sum_gyro / MPU_SAMPLES_BUFFER;
  
  // 4. Wave intensity score (kombinasi)
  // Bobot: accel_z_std paling penting (vertikal motion = ombak),
  //        accel_mag (dynamic motion), gyro_mag (rotasi/miring)
  wave_score = (accel_z_std * 1.5) + (accel_mag_mean * 1.0) + (gyro_mag_mean * 0.05);
  
  // 5. Kategori
  if (wave_score < 1.0) category = 0;        // CALM (tenang)
  else if (wave_score < 3.0) category = 1;   // MODERATE (sedang)
  else category = 2;                          // ROUGH (ganas)
}

// ==================== LOOP ====================

void loop() {
  // Baca GPS terus-menerus (non-blocking)
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }
  
  // Sample MPU tiap 100ms (10 Hz)
  if (millis() - last_mpu_sample_ms >= (1000 / MPU_SAMPLE_HZ)) {
    last_mpu_sample_ms = millis();
    readMPUSample();
  }
  
  // Kirim data tiap 1 detik
  if (millis() - last_send_ms >= SEND_INTERVAL_MS) {
    last_send_ms = millis();
    BuoyPacket pkt = buildPacket();
    printPacket(pkt);
    sendPacket(pkt);
    packet_counter++;
  }
}

// ==================== BUILD PACKET ====================

BuoyPacket buildPacket() {
  BuoyPacket pkt;
  pkt.node_id = NODE_ID;
  pkt.packet_num = packet_counter;
  
  // === GPS (kecepatan & arah arus) ===
  if (gps.location.isValid()) {
    pkt.latitude = gps.location.lat();
    pkt.longitude = gps.location.lng();
    pkt.gps_valid = 1;
  } else {
    pkt.latitude = 0.0;
    pkt.longitude = 0.0;
    pkt.gps_valid = 0;
  }
  pkt.gps_speed  = gps.speed.isValid()  ? (gps.speed.kmph() / 3.6) : 0.0;
  pkt.gps_course = gps.course.isValid() ? gps.course.deg()         : 0.0;
  
  // === MPU6050 (wave intensity) ===
  int16_t ax, ay, az;
  mpu.getAcceleration(&ax, &ay, &az);
  pkt.accel_x = ((float)(ax - accel_bias_x) / ACCEL_SCALE) * G_TO_MS2;
  pkt.accel_y = ((float)(ay - accel_bias_y) / ACCEL_SCALE) * G_TO_MS2;
  pkt.accel_z = ((float)(az - accel_bias_z) / ACCEL_SCALE) * G_TO_MS2;
  
  // Hitung wave intensity dari buffer
  // PENTING: pakai variabel lokal dulu karena struct packed tidak bisa
  // melewatkan field sebagai reference (alamat mungkin tidak aligned)
  float local_z_std, local_acc_mag, local_gyro_mag, local_intensity;
  uint8_t local_category;
  
  calculateWaveIntensity(
    local_z_std,
    local_acc_mag,
    local_gyro_mag,
    local_intensity,
    local_category
  );
  
  // Assign hasil ke struct (value assignment OK pada packed struct)
  pkt.accel_z_std    = local_z_std;
  pkt.accel_mag_mean = local_acc_mag;
  pkt.gyro_mag_mean  = local_gyro_mag;
  pkt.wave_intensity = local_intensity;
  pkt.wave_category  = local_category;
  
  return pkt;
}

// ==================== PRINT & SEND ====================

void printPacket(const BuoyPacket& pkt) {
  Serial.print("[#"); Serial.print(pkt.packet_num); Serial.print("] ");
  
  // ARUS dari GPS
  Serial.print("ARUS:");
  if (pkt.gps_valid) {
    Serial.print(" v=");
    Serial.print(pkt.gps_speed, 2);
    Serial.print("m/s arah=");
    Serial.print(pkt.gps_course, 0);
    Serial.print("deg");
  } else {
    Serial.print(" NO FIX");
  }
  
  // GELOMBANG dari MPU
  Serial.print(" | OMBAK: intensity=");
  Serial.print(pkt.wave_intensity, 2);
  Serial.print(" [");
  if (pkt.wave_category == 0) Serial.print("CALM");
  else if (pkt.wave_category == 1) Serial.print("MODERATE");
  else Serial.print("ROUGH");
  Serial.print("]");
}

void sendPacket(const BuoyPacket& pkt) {
  LoRa.beginPacket();
  LoRa.write((uint8_t*)&pkt, sizeof(pkt));
  int result = LoRa.endPacket();
  Serial.println(result == 1 ? " -> SENT" : " -> FAILED");
}
