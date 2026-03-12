export async function removeUser() {
  return axios.delete('/api/users/1', { headers });
}
