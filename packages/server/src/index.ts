import { startServer } from './server.js';
import dotenv from 'dotenv';

dotenv.config();
const port = parseInt(process.env.PORT || '3800');
startServer(port).catch(err => { console.error('Failed to start:', err); process.exit(1); });
