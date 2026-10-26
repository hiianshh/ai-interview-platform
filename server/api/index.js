import { app, connectDatabase } from '../src/server.js';

export default async function handler(request, response) {
  await connectDatabase();
  return app(request, response);
}
