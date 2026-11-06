import axios from 'axios';
import { API_BASE_URL } from './constants';
const api = axios.create({ baseURL: API_BASE_URL, withCredentials: true, timeout: 20000 });
async function get(path, params, signal) {
  const { data } = await api.get(`/api/${path}`, { params, signal });
  if (data?.success !== true) throw new Error(data?.error || 'Unable to retrieve temperature data.');
  return data;
}
export const getTemperatureLatest = (slaveId, signal) => get('getTemperatureData', slaveId ? { slave_id: slaveId } : {}, signal);
export const getTemperatureStatus = signal => get('getTemperatureGatewayStatus', {}, signal);
export const getTemperatureHistory = (params, signal) => get('getHistoricalTemperatureData', { ...params, metric: 'all' }, signal);
