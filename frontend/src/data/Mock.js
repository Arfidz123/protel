export const MOCK_LOCATIONS = [
  {
    deviceId: 'device1',
    name: 'Parangtritis - West Zone',
    latitude: -8.0254,
    longitude: 110.3288,
    status: 'online',
    lastUpdate: '2026-04-12T20:00:00Z'
  },
  {
    deviceId: 'device2',
    name: 'Parangtritis - East Zone',
    latitude: -8.0268,
    longitude: 110.3325,
    status: 'online',
    lastUpdate: '2026-04-12T20:05:00Z'
  },
  {
    deviceId: 'device3',
    name: 'Depok Beach - Support Node',
    latitude: -8.0150,
    longitude: 110.3055,
    status: 'offline',
    lastUpdate: '2026-04-11T15:30:00Z'
  }
];

export const MOCK_HISTORY = [
  {
    timestamp: '2026-04-12T10:00:00Z',
    device1Speed: 0.85,
    device1Direction: 180,
    device2Speed: 0.92,
    device2Direction: 175,
  },
  {
    timestamp: '2026-04-12T09:45:00Z',
    device1Speed: 1.65, // Akan terdeteksi "High"
    device1Direction: 190,
    device2Speed: 1.55,
    device2Direction: 185,
  },
  {
    timestamp: '2026-04-11T22:30:00Z',
    device1Speed: 1.20, // Akan terdeteksi "Moderate"
    device1Direction: 170,
    device2Speed: 1.15,
    device2Direction: 172,
  },
  {
    timestamp: '2026-04-10T14:20:00Z',
    device1Speed: 0.45, // Akan terdeteksi "Low"
    device1Direction: 160,
    device2Speed: 0.38,
    device2Direction: 155,
  },
  // Tambahkan lebih banyak data di sini untuk mengetes scroll tabel
];