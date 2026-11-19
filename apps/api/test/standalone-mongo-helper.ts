import { MongoMemoryServer, MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

export interface StandaloneMongoTestInstance {
  mongod: MongoMemoryServer;
  conn: mongoose.Connection;
  uri: string;
}

export async function startStandaloneMongo(): Promise<StandaloneMongoTestInstance> {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  const conn = mongoose.createConnection(uri);
  await new Promise<void>((resolve, reject) => {
    conn.once('connected', () => resolve());
    conn.once('error', reject);
  });
  return { mongod, conn, uri };
}

export async function stopStandaloneMongo(instance?: StandaloneMongoTestInstance | null): Promise<void> {
  if (!instance) return;
  try {
    await instance.conn?.close();
  } catch {}
  try {
    await instance.mongod?.stop();
  } catch {}
}

export interface ReplSetMongoTestInstance {
  mongod: MongoMemoryServer;
  conn: mongoose.Connection;
  uri: string;
}

export async function startReplSetMongo(): Promise<ReplSetMongoTestInstance> {
  const mongod = await MongoMemoryServer.create({ instance: { replSet: 'rs0' } });
  const port = mongod.instanceInfo?.port;
  if (!port) throw new Error('MongoMemoryServer did not allocate a port for replSet');

  const direct = mongoose.createConnection(`mongodb://127.0.0.1:${port}/test?directConnection=true`);
  await new Promise<void>((resolve, reject) => {
    direct.once('connected', () => resolve());
    direct.once('error', reject);
  });

  try {
    await direct.db!.admin().command({
      replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: `127.0.0.1:${port}` }] },
    });
  } catch (e: any) {
    if (!/already initiated/i.test(e?.message ?? '')) throw e;
  }

  // Wait for primary
  for (let i = 0; i < 40; i++) {
    try {
      const hello: any = await direct.db!.admin().command({ hello: 1 });
      if (hello.isWritablePrimary) break;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  await direct.close();

  const uri = `mongodb://127.0.0.1:${port}/test?replicaSet=rs0`;
  const conn = mongoose.createConnection(uri);
  await new Promise<void>((resolve, reject) => {
    conn.once('connected', () => resolve());
    conn.once('error', reject);
  });
  return { mongod, conn, uri };
}

export async function stopReplSetMongo(instance?: ReplSetMongoTestInstance | null): Promise<void> {
  if (!instance) return;
  try {
    await instance.conn?.close();
  } catch {}
  try {
    const proc = (instance.mongod as any)?.instanceInfo?.instance?.mongodProcess;
    if (proc && !proc.killed) {
      proc.kill('SIGKILL');
    }
  } catch {}
  try {
    await instance.mongod?.stop({ doCleanup: true, force: true });
  } catch {}
}

