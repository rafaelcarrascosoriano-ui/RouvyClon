import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// In-Memory Strava OAuth Store
interface StravaSession {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  athlete?: {
    id: number;
    username?: string;
    firstname?: string;
    lastname?: string;
    profile?: string;
  };
}

const stravaSession: StravaSession = {
  clientId: process.env.STRAVA_CLIENT_ID || process.env.CLIENT_ID || '',
  clientSecret: process.env.STRAVA_CLIENT_SECRET || process.env.CLIENT_SECRET || '',
};

function getRedirectUri(req: express.Request): string {
  // Always prioritize APP_URL environment variable as specified in AI Studio guidelines
  if (process.env.APP_URL) {
    const cleanAppUrl = process.env.APP_URL.replace(/\/+$/, '');
    return `${cleanAppUrl}/api/strava/callback`;
  }
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`;
  return `${protocol}://${host}/api/strava/callback`;
}

// -----------------------------------------------------------------------------
// 1. STRAVA OAUTH ENDPOINTS
// -----------------------------------------------------------------------------

// Configure Strava credentials from UI if not in .env
app.post('/api/strava/configure', (req, res) => {
  const { clientId, clientSecret } = req.body;
  if (clientId) stravaSession.clientId = String(clientId).trim();
  if (clientSecret) stravaSession.clientSecret = String(clientSecret).trim();
  res.json({
    success: true,
    configured: Boolean(stravaSession.clientId && stravaSession.clientSecret),
    clientId: stravaSession.clientId,
  });
});

// Check connection and configuration status
app.get('/api/strava/status', (req, res) => {
  const redirectUri = getRedirectUri(req);
  res.json({
    configured: Boolean(stravaSession.clientId && stravaSession.clientSecret),
    connected: Boolean(stravaSession.accessToken),
    clientId: stravaSession.clientId,
    athlete: stravaSession.athlete || null,
    redirectUri,
  });
});

// Get authorization URL to open in popup
app.get('/api/strava/auth-url', (req, res) => {
  if (!stravaSession.clientId) {
    return res.status(400).json({
      error: 'STRAVA_CLIENT_ID no está configurado. Introduce tu Client ID de Strava en Ajustes o en el archivo .env',
      configured: false,
    });
  }

  const redirectUri = getRedirectUri(req);
  const params = new URLSearchParams({
    client_id: stravaSession.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:write,activity:read_all',
  });

  const url = `https://www.strava.com/oauth/authorize?${params.toString()}`;
  res.json({ url, redirectUri, configured: true });
});

// OAuth Callback handler (Popup flow with postMessage)
app.get(['/api/strava/callback', '/api/strava/callback/'], async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Strava Auth Error</title></head>
        <body style="font-family:sans-serif;background:#0f172a;color:#f87171;text-align:center;padding:50px;">
          <h2>Error de autorización con Strava</h2>
          <p>${error || 'No se recibió código de autorización.'}</p>
          <script>
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: stravaSession.clientId,
        client_secret: stravaSession.clientSecret,
        code: String(code),
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.message || 'Fallo al intercambiar el código por tokens.');
    }

    stravaSession.accessToken = tokenData.access_token;
    stravaSession.refreshToken = tokenData.refresh_token;
    stravaSession.expiresAt = tokenData.expires_at;
    stravaSession.athlete = tokenData.athlete;

    const athleteName = tokenData.athlete
      ? `${tokenData.athlete.firstname || ''} ${tokenData.athlete.lastname || ''}`.trim()
      : 'Ciclista';

    // Return HTML that notifies opener via postMessage and closes popup
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Strava Conectado</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #090d16; color: #fff; text-align: center; padding: 40px; }
            .box { background: #131b2e; border: 1px solid #fc4c02; border-radius: 16px; padding: 30px; display: inline-block; max-width: 400px; box-shadow: 0 10px 30px rgba(252,76,2,0.2); }
            h2 { color: #fc4c02; margin-top: 0; }
          </style>
        </head>
        <body>
          <div class="box">
            <h2>¡Conectado con Strava con éxito!</h2>
            <p>Bienvenido, <strong>${athleteName}</strong>.</p>
            <p style="color:#94a3b8;font-size:12px;">Cerrando ventana automáticamente...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'STRAVA_AUTH_SUCCESS',
                athlete: ${JSON.stringify(tokenData.athlete || {})}
              }, '*');
              setTimeout(() => window.close(), 1200);
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Error</title></head>
        <body style="font-family:sans-serif;background:#090d16;color:#f87171;text-align:center;padding:40px;">
          <h3>Error conectando con Strava</h3>
          <p>${err?.message || err}</p>
          <button onclick="window.close()" style="padding:10px 20px;border-radius:8px;background:#334155;color:#fff;border:none;cursor:pointer;">Cerrar</button>
        </body>
      </html>
    `);
  }
});

// Upload Activity to Strava
app.post('/api/strava/upload', async (req, res) => {
  if (!stravaSession.accessToken) {
    return res.status(401).json({
      error: 'No has iniciado sesión en Strava. Conéctate primero desde la aplicación.',
    });
  }

  const { name, description, tcxContent, gpxContent, distanceMeters, elapsedSeconds } = req.body;

  try {
    // 1. Try file upload via /api/v3/uploads (multipart)
    const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;
    const fileContent = tcxContent || gpxContent;
    const fileExt = tcxContent ? 'tcx' : 'gpx';
    const fileName = `activity_${Date.now()}.${fileExt}`;

    let payloadParts: Buffer[] = [];

    // Helper to add form field
    const addField = (fieldName: string, value: string) => {
      payloadParts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"\r\n\r\n${value}\r\n`
        )
      );
    };

    addField('name', name || 'Entrenamiento Bkool Smart Pro (Rouvy)');
    addField('description', description || 'Ruta virtual en interior con rodillo Bkool Smart Pro y pendiente automática FE-C.');
    addField('trainer', '1');
    addField('data_type', fileExt);

    // Add file
    payloadParts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/xml\r\n\r\n`
      )
    );
    payloadParts.push(Buffer.from(fileContent, 'utf-8'));
    payloadParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const multipartBody = Buffer.concat(payloadParts);

    const uploadRes = await fetch('https://www.strava.com/api/v3/uploads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stravaSession.accessToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    const uploadData = await uploadRes.json();

    if (uploadRes.ok && uploadData.id) {
      return res.json({
        success: true,
        uploadId: uploadData.id,
        activityId: uploadData.activity_id || null,
        status: uploadData.status || 'Subida procesada en Strava',
        stravaUrl: uploadData.activity_id
          ? `https://www.strava.com/activities/${uploadData.activity_id}`
          : 'https://www.strava.com/athlete/training/activities',
      });
    }

    // 2. Fallback: Direct Activity Creation via /api/v3/activities
    const activityRes = await fetch('https://www.strava.com/api/v3/activities', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stravaSession.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name || 'Sesión Bkool Smart Pro (Rouvy)',
        type: 'VirtualRide',
        sport_type: 'VirtualRide',
        start_date_local: new Date().toISOString(),
        elapsed_time: Math.round(elapsedSeconds || 1800),
        distance: Math.round(distanceMeters || 10000),
        trainer: 1,
        description: description || 'Entrenamiento virtual Bkool Smart Pro con pendientes GPX y WebUSB ANT+ FE-C.',
      }),
    });

    const activityData = await activityRes.json();
    if (!activityRes.ok) {
      throw new Error(activityData.message || uploadData.error || 'Error al registrar actividad en Strava.');
    }

    res.json({
      success: true,
      activityId: activityData.id,
      stravaUrl: `https://www.strava.com/activities/${activityData.id}`,
      status: 'Actividad registrada con éxito en Strava',
    });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || 'Error al subir la actividad a Strava',
    });
  }
});

// Disconnect Strava
app.post('/api/strava/disconnect', (req, res) => {
  stravaSession.accessToken = undefined;
  stravaSession.refreshToken = undefined;
  stravaSession.athlete = undefined;
  res.json({ success: true, connected: false });
});

// -----------------------------------------------------------------------------
// 2. VITE DEV MIDDLEWARE OR PRODUCTION STATIC SERVING
// -----------------------------------------------------------------------------
async function setupServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Rouvy Simulator Server] Running on http://0.0.0.0:${PORT}`);
  });
}

setupServer();
