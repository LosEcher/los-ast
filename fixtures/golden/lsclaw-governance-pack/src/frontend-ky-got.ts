import ky from 'ky';
import got from 'got';
import superagent from 'superagent';

export async function loadUsersKy() {
  return ky.get('/api/users').json();
}

export async function createUserGot() {
  return got.post('/api/users', { json: { name: 'test' } });
}

export async function removeUserSuperagent() {
  return superagent.delete('/api/users/1');
}
