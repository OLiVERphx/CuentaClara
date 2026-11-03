# Bodega

Sistema de gestión para bodegas venezolanas: inventario, precios en USD y Bs con la tasa del BCV, y (en próximas fases) ventas, caja, fiao y proveedores.

Es una PWA *local-first*: se instala desde el navegador, guarda los datos en el propio equipo y funciona sin internet. El diseño completo y las decisiones están en [docs/DISENO.md](docs/DISENO.md).

## Requisitos

- Node.js 22 o superior (probado con 26 LTS)
- Chrome o Edge para usarla (IndexedDB, Service Worker, CompressionStream)

## Comandos

```bash
npm install          # dependencias
npm run dev          # servidor de desarrollo en http://localhost:5173
npm test             # pruebas automáticas (Vitest)
npm run check        # verificación de tipos (svelte-check)
npm run build        # versión de producción en dist/
npm run preview      # sirve dist/ en http://localhost:4173 (con modo sin conexión)
npm run iconos       # regenera los íconos PWA desde public/icono.svg
```

El modo sin conexión solo se activa en la versión de producción (`build` + `preview` o el hosting), no en `dev`.

## Estructura

```
src/
├── core/                 núcleo compartido (no depende de pantallas)
│   ├── dinero/           aritmética entera USD/Bs, redondeo, formato venezolano
│   ├── tasa/             tasa BCV: vigente por fecha valor, consulta automática, carga manual
│   ├── auth/             usuarios, PIN (PBKDF2), roles y permisos, bloqueo por intentos
│   ├── db/               base de datos Dexie, campos comunes listos para sincronizar
│   ├── eventos/          bus de eventos entre módulos
│   ├── auditoria/        registro de acciones sensibles
│   ├── config/           configuración del negocio y del equipo
│   └── respaldo/         respaldo cifrado (AES-GCM) y restauración
├── modulos/
│   ├── inventario/       productos, presentaciones, búsqueda, ajustes, kardex, importación CSV
│   ├── ventas/           ticket, cobro mixto y vuelto, comprobante, anulación, devolución
│   ├── clientes/         clientes, fiao en USD, saldo a favor, abonos y ajustes
│   ├── compras/          proveedores, compras, cuentas por pagar y pagos a proveedores
│   └── caja/             apertura, resumen por método, gastos, retiros, cierre con arqueo
├── app/                  arranque, rutas, estado global, menú y pantallas del núcleo
└── ui/                   componentes compartidos
```

### Cómo agregar un módulo

1. Crear `src/modulos/<nombre>/` con su `esquema.ts`, `tipos.ts`, `servicio.ts`, pantallas y `manifiesto.ts`.
2. Sumar sus tablas en una **versión nueva** de `src/core/db/db.ts` (nunca editar una versión publicada).
3. Listar el manifiesto en `src/app/registro.ts`.
4. Escribir en otros módulos solo por eventos (`core/eventos/bus.ts`). Leer de ellos sí se puede: tipos, funciones puras, almacén y `consultas.ts`.
5. Si escucha eventos que escriben (por ejemplo `venta.registrada`), registrar los oyentes en un `oyentes.ts` y llamarlo desde `iniciar()`: así también se usan en las pruebas.

## Reglas que no se rompen

- **Dinero como enteros**, nunca `float` (ver `core/dinero/dinero.ts`).
- **El stock solo cambia con movimientos** (`aplicarMovimiento`), y cada uno queda en el kardex.
- **Nada se borra**: borrado lógico (`eliminadoEn`) y auditoría.
- **Los permisos se verifican en los servicios**, no solo en la interfaz.
