import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import CONFIG from '../config/index.js';
import logger from '../utils/logger.js';
import { createDashboardRoutes } from './routes.js';

// =============================================================================
// DASHBOARD WEB SERVER
// =============================================================================
// Servidor Express para o painel administrativo do bot WhatsApp
// =============================================================================

class DashboardServer {
  private app: Express;
  private server: ReturnType<Express['listen']> | null = null;
  private isInitialized = false;

  constructor() {
    this.app = express();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Middleware básico
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS simples para desenvolvimento
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // Autenticação básica
    this.app.use('/api', this.authMiddleware.bind(this));

    // Rotas da API
    const apiRouter = createDashboardRoutes();
    this.app.use('/api', apiRouter);

    // Servir arquivos estáticos do frontend
    const publicPath = path.join(process.cwd(), 'public');
    this.app.use(express.static(publicPath));

    // Fallback para SPA
    this.app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });

    // Error handler
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      logger.error('[Dashboard] Erro na requisição', err);
      res.status(500).json({ error: 'Erro interno do servidor' });
    });

    this.isInitialized = true;
    logger.info('[Dashboard] Servidor configurado');
  }

  private authMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Rotas públicas (sem autenticação)
    const publicRoutes = ['/api/health'];
    if (publicRoutes.some(route => req.path.startsWith(route.replace('/api', '')))) {
      return next();
    }

    // Verificar header de autenticação
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Autenticação necessária' });
      return;
    }

    // Basic Auth
    if (authHeader.startsWith('Basic ')) {
      const base64Credentials = authHeader.slice(6);
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
      const [username, password] = credentials.split(':');

      if (
        username === CONFIG.dashboard.username &&
        password === CONFIG.dashboard.password
      ) {
        return next();
      }
    }

    res.status(401).json({ error: 'Credenciais inválidas' });
  }

  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const port = CONFIG.dashboard.port;

    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        logger.info(`[Dashboard] Servidor iniciado em http://localhost:${port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          logger.info('[Dashboard] Servidor encerrado');
          this.server = null;
          resolve();
        });
      });
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.server !== null;
  }
}

// Singleton
const dashboardServer = new DashboardServer();
export default dashboardServer;
