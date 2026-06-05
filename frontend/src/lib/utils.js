// Konversi derajat ke arah mata angin
export const getCompassDirection = (degrees) => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
};

// Logika penentuan status risiko
export const getRiskStatus = (avgSpeed) => {
  if (avgSpeed > 1.5) return { label: "High Risk", color: "destructive" };
  if (avgSpeed > 1.0) return { label: "Moderate", color: "warning" };
  return { label: "Low Risk", color: "success" };
};