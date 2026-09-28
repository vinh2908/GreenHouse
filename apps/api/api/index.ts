import express from 'express';
import { createNestServer } from '../src/serverless';

const server = express();
let isInitialized = false;

export default async function handler(req: any, res: any) {
  if (!isInitialized) {
    await createNestServer(server);
    isInitialized = true;
  }
  server(req, res);
}
