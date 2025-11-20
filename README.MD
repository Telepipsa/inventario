Aplicación de control de caducidades y conteo de inventario
-------------------------------------------------

Esta aplicación permite a los negocios gestionar las caducidades de
sus productos y poder apuntar el stock para luego introducirlo en el sistema

---

Server-backed deployment
------------------------

Esta copia del proyecto incluye un servidor Node simple (`scripts/server.js`) que sirve
la web y expone una API mínima para sincronizar productos entre dispositivos.

Endpoints importantes:
- `GET /api/products` — devuelve la lista actual de productos
- `POST /api/products` — reemplaza la lista actual (recomendado proteger con `X-API-KEY`)
- `GET /api/history` — devuelve el historial (últimas 10 entradas)
- `GET /api/history/last?n=10` — devuelve las últimas `n` entradas

Arrancar en local:

1. Instalar dependencias:

```powershell
cd 'C:\Users\kevin\Desktop\Telepizza\Programa estimacion\inventario-app'
npm install
```

2. Iniciar servidor:

```powershell
npm start
Start-Process "http://localhost:3000"
```

3. En la interfaz de la app pulsa `Config servidor` y pon `http://localhost:3000` como URL base. Si configuraste `API_KEY` también añádela.

Despliegue (ej. Render)
----------------------

1. Sube el repo a GitHub (usa los comandos abajo) y conecta el repo desde Render.
2. En Render configura el comando de inicio `npm start` y añade la variable de entorno `API_KEY` con un valor seguro.
3. Deploy — la URL pública servirá la app y la API.

Comandos Git rápidos:

```powershell
cd 'C:\Users\kevin\Desktop\Telepizza\Programa estimacion\inventario-app'
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/Telepipsa/inventario.git
git branch -M main
git push -u origin main
```

Si prefieres que te genere un README específico para Render o un script de deploy, dímelo.
