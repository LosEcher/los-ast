export async function runUnsafeQuery(db, userId) {
  return db.query('select * from users where id = ' + userId);
}
