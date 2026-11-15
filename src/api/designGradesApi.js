import axios from 'axios';
import { API_BASE_URL } from './constants';
const api = axios.create({ baseURL: API_BASE_URL, withCredentials: true, timeout: 15000 });
export async function getDesignGrades(signal) {
  const { data } = await api.get('/api/design-grades', { signal });
  if (!data?.success || !Array.isArray(data.grades)) throw new Error(data?.error || 'Unable to load design grades.');
  return data.grades;
}
export async function saveDesignGrade(record, existingGrade) {
  const { data } = existingGrade
    ? await api.put(`/api/design-grades/${encodeURIComponent(existingGrade)}`, record)
    : await api.post('/api/design-grades', record);
  if (!data?.success) throw new Error(data?.error || 'Unable to save design grade.');
  return data.grade;
}
