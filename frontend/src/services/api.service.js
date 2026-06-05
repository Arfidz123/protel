import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

export const apiService = {
  getDashboardData: async () => {
    try {
      const response = await axios.get(`${API_URL}/dashboard`);
      return response.data;
    } catch (error) {
      console.error("Gagal mengambil data:", error);
      return { success: false, error: "Server tidak merespon" };
    }
  }
};