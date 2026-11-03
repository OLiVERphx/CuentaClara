# Documento de diseño — Sistema de gestión para bodegas

> **Nombre comercial:** por definir (nombre clave del proyecto: `bodega`)
> **Versión del documento:** 1.0 — 2026-11-01
> **Estado:** pendiente de aprobación. No se escribe código hasta que el dueño lo apruebe.

---

## 1. Objetivo

Reemplazar el control en papel de una bodega venezolana con un sistema que:

- controle el inventario en detalle;
- maneje dos precios: un precio fijo en USD y el precio en Bs según la tasa oficial del BCV del día;
- busque productos y sus precios en tiempo real;
- registre ventas con varios métodos de pago y emita comprobantes internos;
- lleve las deudas del negocio con proveedores y las de los clientes ("fiao");
- funcione sin internet, en equipos modestos, y pueda crecer a minimarket, a varios dispositivos y, a futuro, a otros negocios.

**Fuera de alcance:** facturación fiscal. El sistema emite **comprobantes internos o notas de entrega**, no facturas válidas ante el SENIAT (eso requiere una impresora fiscal o un software homologado).

---

## 2. Decisiones tomadas

| # | Tema | Decisión |
|---|---|---|
| D1 | Plataforma | PWA *local-first*: los datos viven en el dispositivo y funciona sin internet |
| D2 | Stack | TypeScript + Svelte + Vite + Dexie.js (IndexedDB) + Vitest |
| D3 | Dispositivos | Laptop ahora; laptop y teléfono a la vez en el futuro. El modelo de datos está listo para sincronizar desde el inicio |
| D4 | Moneda base | USD. El precio en Bs se calcula como `USD × tasa` |
| D5 | Precios en Bs fijo | Se permiten como excepción por producto |
| D6 | Redondeo en Bs | Se redondea el **precio en Bs de cada producto** (por defecto al bolívar entero más cercano; configurable a 0,50, 1, 5 o 10) y todo se calcula desde ese precio: el cliente paga exactamente lo que ve, aunque lleve un solo producto. *(Cambiado el 2026-11-02; antes solo se redondeaba el total.)* |
| D7 | Costo | Costo promedio ponderado |
| D8 | Tasa | La tasa BCV se aplica automáticamente según su fecha valor. Fines de semana y feriados usan la última vigente. Siempre se puede cargar a mano |
| D9 | Ajuste sobre la tasa | Opcional, 0 % por defecto |
| D10 | Divisas | Solo USD por ahora; la estructura admite otras monedas. El vuelto puede darse en USD o en Bs |
| D11 | Fiao | En USD, sin intereses, con límite de crédito opcional; se permiten ventas parcialmente fiadas |
| D12 | Deudas con proveedores | Se elige la moneda en cada compra: USD o Bs fijo |
| D13 | Usuarios | Por ahora solo el dueño, con PIN. Los roles quedan construidos |
| D14 | IVA | Precios finales sin desglose; campo de impuesto preparado pero apagado |
| D15 | Stock en cero | Se permite vender, con una advertencia, y queda registrado |
| D16 | Devoluciones | Parciales. Reingresan el producto al stock y devuelven el dinero o dejan saldo a favor |
| D17 | Gastos y retiros | Se registran dentro del módulo de caja |
| D18 | Carga inicial | Formulario rápido más importación desde CSV o Excel |
| D19 | Alojamiento | Hosting estático gratuito (Cloudflare Pages o GitHub Pages). Solo se publica el código; los datos nunca salen del dispositivo |
| D20 | Respaldos | Automáticos a una carpeta elegida al cerrar caja, más respaldo manual; cifrados con contraseña |
| D21 | Control de versiones | Repositorio git desde el primer día |

**Pospuesto:** recordatorios y recibos por WhatsApp, impresora térmica, lector de código de barras (aunque la búsqueda ya queda compatible con él), fechas de vencimiento y multi-negocio.

---

## 3. Arquitectura

### 3.1 Vista general

```
┌────────────────────── Navegador (Chrome / Edge) ──────────────────────┐
│                                                                        │
│  UI (Svelte)  ──►  Servicios de módulo  ──►  Repositorios  ──► Dexie    │
│                        │      ▲                               (IndexedDB)│
│                        ▼      │                                        │
│                    Bus de eventos                                      │
│                                                                        │
│  Service Worker: cachea la app para usarla sin conexión                 │
└────────────────────────────────────────────────────────────────────────┘
          │ (solo si hay internet)
          ▼
   API de la tasa BCV          Hosting estático (código de la app)
```

### 3.2 Estructura de carpetas

```
src/
├── core/
│   ├── dinero/        aritmética entera, conversión USD↔Bs, redondeo
│   ├── tasa/          tasa vigente, historial, consulta automática
│   ├── auth/          usuarios, PIN, roles y permisos, bloqueo
│   ├── db/            esquema Dexie, migraciones, campos de sincronización
│   ├── eventos/       bus de eventos tipado
│   ├── auditoria/     registro de acciones sensibles
│   ├── config/        configuración del negocio
│   └── respaldo/      exportar e importar, cifrado
├── modulos/
│   ├── inventario/    productos, categorías, presentaciones, ajustes, kardex
│   ├── ventas/        ticket, cobro, comprobante, anulación, devolución
│   ├── caja/          apertura, cierre, gastos, retiros, arqueo
│   ├── clientes/      clientes, fiao, abonos
│   ├── compras/       proveedores, compras, cuentas por pagar
│   └── reportes/
├── ui/                componentes compartidos
└── app/               rutas, layout, registro de módulos
```

### 3.3 Reglas de modularidad

1. Cada módulo exporta un **manifiesto**: nombre, tablas, rutas, entradas de menú, permisos y suscripciones a eventos. El núcleo los registra al arrancar.
2. **Ningún módulo escribe en los datos de otro.** Las escrituras viajan por eventos. Un módulo sí puede *leer* de otro: sus tipos, sus funciones puras (por ejemplo, `inventario/precios.ts`), su almacén de pantalla y sus `consultas.ts` (por ejemplo, ventas pregunta a caja si hay una sesión abierta).
3. Las pantallas no tocan la base de datos directamente: UI → servicio → repositorio.
4. Las operaciones que cambian varias tablas (por ejemplo, registrar una venta) se ejecutan en **una sola transacción de Dexie**. Si algo falla, no se guarda nada.

### 3.4 Eventos principales

| Evento | Lo emite | Lo escuchan |
|---|---|---|
| `venta.registrada` | ventas | inventario (descuenta stock), caja (suma pagos), clientes (crea el cargo si hubo fiao) |
| `venta.anulada` | ventas | inventario, caja, clientes (revierten) |
| `devolucion.registrada` | ventas | inventario, caja, clientes |
| `compra.registrada` | compras | inventario (entrada y costo promedio), caja (si se pagó desde caja) |
| `abono.registrado` | clientes | caja |
| `pago_proveedor.registrado` | compras | caja (si sale de caja) |
| `tasa.actualizada` | tasa | UI (recalcula los precios mostrados) |

Nota de implementación: para garantizar la atomicidad, los oyentes de eventos que escriben en la base corren **dentro de la misma transacción** que el emisor.

---

## 4. Convenciones de datos

### 4.1 Dinero y cantidades (nunca `float`)

| Concepto | Almacenamiento | Ejemplo |
|---|---|---|
| Montos en USD (precios, totales, pagos) | entero en **centavos** | $1,25 → `125` |
| Costos unitarios en USD | entero en **diezmilésimas** | $0,4167 → `4167` |
| Montos en Bs | entero en **céntimos** | Bs 45,50 → `4550` |
| Tasa (Bs por USD) | entero con 4 decimales | 36,5821 → `365821` |
| Cantidades | entero en **milésimas** | 1 unidad → `1000`; 0,250 kg → `250` |
| Porcentajes | entero en centésimas | 2,5 % → `250` |

- El redondeo intermedio es "mitad hacia arriba" y se hace solo en las funciones de `core/dinero`.
- **Formato venezolano en pantalla:** `1.234,56`.

### 4.2 Campos comunes (preparados para sincronizar)

Toda tabla de negocio tiene:

| Campo | Uso |
|---|---|
| `id` | UUID v7 (ordenado por tiempo, único entre dispositivos) |
| `creado_en`, `actualizado_en` | marcas de tiempo (ISO 8601) |
| `eliminado_en` | borrado lógico; nunca se borra físicamente |
| `dispositivo_id` | dispositivo que creó o modificó el registro |
| `version` | se incrementa en cada cambio (resolución de conflictos futura) |

### 4.3 Numeración de documentos

Correlativo por dispositivo con prefijo: `L-000123` (laptop), `T-000045` (teléfono). El prefijo se configura al instalar.

---

## 5. Modelo de datos

### Núcleo
- **Config**: nombre del negocio, RIF, dirección, teléfono, prefijo del dispositivo, paso de redondeo en Bs, ajuste sobre la tasa, permitir stock negativo, minutos para el bloqueo automático, IVA activo (no), contraseña de respaldo (solo su verificador).
- **Usuario**: nombre, rol (`dueno` | `cajero`), `pin_hash`, `pin_salt`, activo.
- **Tasa**: fecha valor, valor, fuente (`auto` | `manual`), usuario que la registró.
- **Auditoria**: fecha, usuario, entidad, id de la entidad, acción, datos anteriores y nuevos (JSON).
- **Contador**: correlativos por tipo de documento.

### Inventario
- **Categoria**: nombre.
- **Producto**: código interno, código de barras (opcional), nombre, nombre normalizado (para búsqueda), categoría, unidad base (`unidad` | `kg`), moneda del precio (`USD` | `VES`), precio, costo promedio (USD), stock (milésimas), stock mínimo, activo.
- **Presentacion**: producto, nombre ("Bulto x24", "Caja x20"), factor (cuántas unidades base contiene), precio propio (opcional), código de barras (opcional), sirve para venta y/o compra. *El stock siempre se lleva en la unidad base.*
- **MovimientoInventario** (kardex): producto, tipo (`entrada_compra` | `venta` | `devolucion` | `anulacion` | `merma` | `consumo_propio` | `ajuste_positivo` | `ajuste_negativo` | `inventario_inicial`), cantidad, costo unitario, stock resultante, documento de origen, motivo, usuario.

### Ventas
- **Venta**: número, fecha, usuario, sesión de caja, cliente (opcional), tasa usada (valor copiado), total USD, total Bs exacto (para reportes), total Bs cobrado (suma de líneas redondeadas), estado (`completada` | `anulada`), motivo de anulación.
- **VentaItem**: venta, producto, presentación, descripción copiada, cantidad, precio unitario copiado (y su moneda), costo unitario copiado, subtotales en USD y Bs.
- **Pago**: venta, método, moneda, monto, equivalente en Bs a la tasa de la venta, referencia, banco, es vuelto (sí/no).
- **Devolucion** y **DevolucionItem**: venta de origen, productos, cantidades, forma de reintegro (`efectivo_bs` | `efectivo_usd` | `pago_movil` | `saldo_a_favor`).

**Métodos de pago:** `punto_venta`, `pago_movil`, `biopago`, `efectivo_bs`, `efectivo_usd`, `credito` (fiao), `saldo_a_favor`.

### Caja
- **SesionCaja**: usuario, apertura (fecha y fondos en efectivo Bs y USD), cierre (fecha, montos contados), esperado por método, diferencias, nota, estado.
- **MovimientoCaja**: sesión, tipo (`venta` | `vuelto` | `abono_cliente` | `pago_proveedor` | `gasto` | `retiro_dueno` | `ingreso_extra` | `devolucion`), método, moneda, monto, documento de origen.
- **Gasto**: categoría (luz, alquiler, bolsas, transporte, otro), descripción, monto, moneda, método, si salió de caja.

### Clientes y fiao
- **Cliente**: nombre, cédula (opcional), teléfono (opcional), límite de crédito USD (opcional), nota, saldo calculado.
- **MovimientoCuenta**: cliente, tipo (`cargo` | `abono` | `saldo_a_favor` | `ajuste`), monto USD, si fue un abono en Bs (monto y tasa del día), venta de origen, usuario.

### Compras y proveedores
- **Proveedor**: nombre, RIF, teléfono, contacto, nota.
- **Compra**: número, proveedor, fecha, número de factura del proveedor, moneda de la deuda (`USD` | `VES`), tasa del día, total, estado de pago (`pagada` | `pendiente` | `parcial`), fecha de vencimiento.
- **CompraItem**: producto, presentación, cantidad, costo unitario.
- **PagoProveedor**: compra, fecha, monto, moneda, método, tasa, si salió de caja.

---

## 6. Reglas de negocio

### 6.1 Precio en Bs
```
tasa_aplicada = tasa_bcv_vigente × (1 + ajuste%)
precio_bs     = redondear(precio_usd × tasa_aplicada, paso)   (lo que se muestra y se cobra)
línea_bs      = redondear(precio_bs × cantidad, paso)         (por unidad ya es exacto; importa en kg)
total_bs      = Σ líneas_bs
```
La conversión exacta (sin redondear) se conserva para reportes. El redondeo afecta como mucho medio paso por línea.
Los productos con precio fijo en Bs no se convierten; su equivalente en USD es solo informativo.

### 6.2 Tasa vigente
- La tasa vigente es la de mayor `fecha_valor ≤ hoy`.
- Al abrir la app con internet, se consulta la tasa. Si llega una con fecha valor futura, se guarda y se activa sola cuando llega esa fecha.
- Si la tasa vigente tiene más de 3 días, se muestra una advertencia visible.
- La fuente automática se elegirá en la Fase 1, entre una API pública de tasas o un intermediario propio (Cloudflare Worker) que lea bcv.org.ve. La carga manual siempre existe como respaldo.

### 6.3 Cobro y cuadre
- La venta requiere una **caja abierta**.
- Los pagos en USD se convierten a Bs a la tasa de la venta para saber cuánto falta.
- La venta queda cuadrada cuando lo pagado cubre el total, con una tolerancia igual al paso de redondeo (así un cliente que paga $5 exactos por un producto de $5 no queda debiendo céntimos).
- Si sobra dinero, se calcula el vuelto y el cajero elige si se da en Bs o en USD (y cuánto de cada uno).
- El método `credito` exige un cliente y respeta su límite de crédito (el dueño puede autorizar que se exceda).
- La parte fiada se guarda en USD: `pendiente_bs ÷ tasa_de_la_venta`.

### 6.4 Fiao
- Saldo del cliente = Σ cargos − Σ abonos (en USD).
- Un abono en Bs se convierte a USD con la tasa del día del abono.
- En pantalla, el saldo se muestra en USD y en Bs a la tasa de hoy.

### 6.5 Costo promedio ponderado
```
si stock_actual ≤ 0:   nuevo_costo = costo_compra
si no:                 nuevo_costo = (stock × costo + cant × costo_compra) / (stock + cant)
```
Las compras en Bs se convierten a USD con la tasa del día de la compra.

### 6.6 Inmutabilidad
- Las ventas, pagos, movimientos de inventario y de cuenta **no se editan ni se borran**. Se corrigen con anulaciones, devoluciones o ajustes, que quedan en la auditoría.
- Para anular una venta hace falta un motivo y permiso de `dueno`.

### 6.7 Cierre de caja
```
esperado_efectivo = fondo_inicial + ventas + abonos + ingresos − vueltos − gastos − retiros − pagos_a_proveedores − devoluciones
```
Se calcula por método y por moneda. El usuario cuenta el efectivo, el sistema muestra la diferencia, y el cierre dispara el respaldo automático.

---

## 7. Seguridad

| Medida | Detalle |
|---|---|
| PIN | De 4 a 6 dígitos, guardado con hash PBKDF2-SHA256 (WebCrypto) y sal por usuario; nunca en texto plano |
| Intentos fallidos | Bloqueo progresivo después de 5 intentos |
| Bloqueo automático | Por inactividad (configurable) |
| Roles | `dueno`: todo. `cajero`: vender, cobrar, abrir caja, consultar; **no** puede cambiar precios, anular, ajustar inventario ni ver costos y ganancias |
| Auditoría | Cambios de precio, anulaciones, ajustes, cierres de caja, cambios de tasa manuales |
| Respaldos | Cifrados con AES-GCM y clave derivada de una contraseña (PBKDF2) |
| Persistencia | Se pide `navigator.storage.persist()` para que el navegador no borre los datos |
| Web | HTTPS, Content Security Policy estricta, sin scripts de terceros ni analítica |

**Límite honesto:** quien tenga acceso físico a la laptop con el navegador abierto puede leer IndexedDB con las herramientas de desarrollador. El PIN protege la operación diaria, no a un atacante técnico con el equipo en la mano. Para eso hay que proteger también la cuenta de Windows.

---

## 8. Rendimiento

| Meta | Valor |
|---|---|
| JavaScript inicial (gzip) | < 200 KB |
| Búsqueda con 20.000 productos | < 50 ms por tecla |
| Arranque en una laptop modesta | < 2 s |
| Registrar una venta | < 100 ms |

**Técnicas:**
- Índice de búsqueda en memoria sobre el nombre normalizado (sin acentos ni mayúsculas), el código y el código de barras.
- Coincidencia por palabras parciales: "har pan" encuentra "Harina P.A.N. 1kg".
- Rutas con carga diferida (reportes, compras y configuración se descargan solo al abrirlas).
- Listas largas virtualizadas (solo se dibuja lo visible).

---

## 9. Pantallas

**Barra superior siempre visible:** tasa del día con su fecha valor · estado de la caja · usuario · indicador de conexión.

1. **Desbloqueo**: teclado de PIN.
2. **Asistente de primer uso**: datos del negocio, PIN del dueño, primera tasa, prefijo del dispositivo y carpeta de respaldos.
3. **Vender** (pantalla principal):
   - buscador con foco permanente y resultados en vivo (nombre, precio en USD y Bs, stock);
   - ticket: líneas editables (cantidad o peso), totales en USD y Bs;
   - **Cobrar** abre un panel de pagos: métodos como botones grandes, montos, referencia y banco para pago móvil y punto, cálculo de lo que falta o sobra, vuelto y opción de fiao con selector de cliente;
   - comprobante en pantalla, imprimible desde el navegador.
4. **Productos**: lista con filtros (categoría, stock bajo, inactivos) y ficha con precios, presentaciones, kardex y margen.
5. **Inventario**: ajustes, mermas, consumo propio, inventario inicial e importación CSV.
6. **Caja**: apertura, movimientos del día, gastos, retiros, cierre con arqueo.
7. **Clientes / Fiao**: lista ordenada por saldo, ficha con historial y botón de abono.
8. **Compras / Proveedores**: nueva compra, lista, cuentas por pagar con vencimientos, pagos.
9. **Reportes**: ventas del día o período, por método de pago, productos más vendidos, ganancia bruta y neta (con gastos), valor del inventario, fiao total y cuentas por pagar.
10. **Configuración**: negocio, tasa (historial y carga manual), usuarios, respaldos, preferencias.

**Atajos de teclado (laptop):** `F2` buscar · `F4` cobrar · `F8` cliente/fiao · `Esc` cancelar · `↑/↓` navegar · `Enter` agregar · `+/-` cantidad.

**Diseño visual:** botones grandes, alto contraste, modo claro y oscuro, adaptable a teléfono, poca animación.

---

## 10. Plan de fases

| Fase | Contenido | Resultado usable |
|---|---|---|
| **1. Fundaciones e inventario** | Proyecto (Vite, Svelte, TS, PWA, Vitest, git), `core/*`, asistente de primer uso, tasa manual y automática, productos, categorías, presentaciones, buscador, importación CSV, ajustes y kardex, respaldo manual | Cargar todos los productos y consultar precios en USD y Bs al instante |
| **2. Ventas y caja** | Ticket, cobro con pagos mixtos, vuelto, comprobante, anulación, devolución, apertura y cierre, gastos, retiros | Vender sin papel |
| **3. Clientes y fiao** | Clientes, ventas a crédito, abonos, límite, saldo a favor | El cuaderno de fiao desaparece |
| **4. Compras y proveedores** | Proveedores, compras (pagadas o pendientes), cuentas por pagar, costo promedio, presentaciones de compra | Deudas propias controladas y costos reales |
| **5. Reportes y robustez** | Reportes, respaldo automático cifrado, alertas de stock, lista de compras sugerida, ajuste masivo de precios, márgenes | Visión completa del negocio |
| **6. Multi-dispositivo** | Sincronización laptop + teléfono (arquitectura por definir entonces: nube o laptop como servidor local) | Vender desde el teléfono |
| **7. Futuro** | WhatsApp, impresora térmica, lector de código, vencimientos, multi-negocio | — |

> Hasta la Fase 4, el stock entra con ajustes de "entrada" o "inventario inicial".

### Criterios de terminado de la Fase 1
- [x] La app se instala como PWA y abre sin internet.
- [x] El asistente de primer uso crea el negocio, el PIN y la primera tasa.
- [x] Se crean, editan y desactivan productos con presentaciones.
- [x] Se importan productos desde CSV con una vista previa de errores.
- [x] La búsqueda responde en < 50 ms con 20.000 productos de prueba.
- [x] Los precios en Bs se recalculan al cambiar la tasa.
- [x] Los ajustes de inventario quedan en el kardex.
- [x] El respaldo exporta e importa todos los datos sin pérdida.
- [x] Hay pruebas automáticas de `core/dinero` y `core/tasa` en verde.

### Ajustes hechos al implementar la Fase 1 (2026-11-02)
- **Fuente automática de la tasa:** DolarApi (`ve.dolarapi.com/v1/dolares/oficial`), que entrega la tasa BCV con su fecha valor y admite consultas desde el navegador.
- **Importación:** solo CSV (Excel lo genera con «Guardar como»). Leer `.xlsx` directamente exigiría una librería de ~400 KB; se puede sumar después cargándola solo en esa pantalla.
- **Listas largas:** se muestran de 200 en 200 con «Mostrar más» en lugar de virtualización; es más simple y alcanza para miles de productos. Se revisará si el catálogo crece mucho.
- **Carpeta de respaldos automáticos:** se pospone a la Fase 5 junto con el respaldo automático; en la Fase 1 el respaldo es manual.
- **Conteo físico:** se agregó como operación de inventario (se escribe lo contado y se registra solo la diferencia).
- **Ajustes manuales:** nunca dejan el stock en negativo (D15 aplica a las ventas, no a los ajustes).

### Fase 2 — terminada (2026-11-02)
- [x] Pantalla de venta con búsqueda por teclado (↑↓ Enter), ticket editable y venta por peso.
- [x] Cobro con pagos mixtos (Bs y $), referencia para pago móvil, punto y biopago, y vuelto en Bs, $ o pago móvil.
- [x] Comprobante interno imprimible.
- [x] Anulación (solo el dueño, con motivo) y devolución parcial.
- [x] Caja: apertura con fondo, resumen por método, gastos, retiros, ingresos y cierre con arqueo.
- [x] Si una venta falla a mitad de camino (por ejemplo, sin stock), no se guarda nada.

**Decisiones tomadas al implementarla:**
- **Cobro mixto proporcional:** un pago en $ vale su parte del ticket (`monto × totalBs ÷ totalUsd`), así pagar todo en $ cubre exactamente el total en Bs, sin diferencias por redondeo. La venta cuadra si la diferencia es menor que medio paso de redondeo o, si hubo pago en $, menor que medio centavo.
- **Los precios se toman de la base al registrar,** no de la pantalla: si alguien cambia un precio con el ticket abierto, la venta lo detecta.
- **Una venta con devoluciones ya no se anula entera;** el resto se devuelve con otra devolución.
- **La anulación y la devolución usan la caja abierta en ese momento**, aunque la venta sea de otra sesión.
- **El fiao (crédito) llega en la Fase 3** junto con los clientes; por eso aún no aparece como método de pago.
- **Base de datos v2:** se agregaron las tablas de ventas y caja; los datos de la Fase 1 se conservan al actualizar.

### Fase 3 — terminada (2026-11-02)
- [x] Clientes con cédula, teléfono, nota y límite de crédito opcional.
- [x] Fiar total o parcial desde el cobro («Fiar a …»), con la deuda en USD (D11).
- [x] Saldo a favor: dejar el vuelto a favor, usarlo en otra compra y devolver productos a saldo a favor.
- [x] Abonos en cualquier método (los de Bs se convierten con la tasa del día) que entran a la caja.
- [x] Ajustes de cuenta (por ejemplo, para cargar las deudas del cuaderno), auditados.
- [x] Anular una venta fiada borra el cargo; superar el límite deshace la venta entera, salvo que la autorice el dueño.

**Decisiones tomadas al implementarla:**
- **El fiao es un método de pago** (`credito`) y el saldo a favor otro (`saldo_a_favor`), ambos en USD y marcados como «de cuenta»: no pasan por la caja. Así heredan pagos mixtos, anulación y devolución sin código especial.
- **Saldo guardado en el cliente** (`saldoUsd`), actualizado en la misma transacción que cada movimiento, para listar deudores sin recorrer el historial. Positivo = debe; negativo = a favor.
- **La caja muestra «Cobrado en ventas»** (sin lo fiado) y los abonos de fiao por separado.
- **El recordatorio por WhatsApp** sigue pospuesto, como se acordó.
- **Base de datos v3:** se agregaron clientes y movimientos de cuenta.

### Fase 4 — terminada (2026-11-02)
- [x] Proveedores (nombre, RIF, teléfono, contacto) con lo que se les debe.
- [x] Compras por unidad, kilo o presentación (bulto x20…), en USD o en Bs fijo (D12).
- [x] Al registrar: el stock sube y el costo promedio se recalcula con el costo de la factura (D7); queda en el kardex.
- [x] Condición de pago: a crédito con fecha límite, pago parcial o total; desde la gaveta o desde otra cuenta.
- [x] Cuentas por pagar: deuda total en $ y en Bs fijo, facturas vencidas y por vencer.
- [x] Pagos posteriores en cualquier moneda, convertidos con la tasa del día.

**Decisiones tomadas al implementarla:**
- **Residuo de conversión:** si al pagar en otra moneda queda menos que la unidad mínima de esa moneda (por ejemplo, Bs 1,76 cuando un centavo de dólar vale ~Bs 9), la deuda se da por saldada. Pagando en la misma moneda no se perdona ni un céntimo.
- **Las compras no se anulan.** Un error de carga se corrige con un ajuste de inventario; si hace falta, se agregará la anulación de compras más adelante (requiere decidir qué pasa con los pagos ya hechos).
- **No se actualizan precios de venta al comprar:** la ficha muestra el nuevo costo y el margen; el ajuste masivo de precios llega en la Fase 5.
- **Menú en teléfono:** con más módulos, la barra inferior se desliza de lado.
- **Base de datos v4:** se agregaron proveedores, compras, sus líneas y los pagos a proveedores.

### Fase 5 — terminada (2026-11-02)
- [x] Reportes por período (hoy, ayer, 7 y 30 días, este mes o un rango): ventas netas, ticket promedio, ganancia bruta con margen, gastos y ganancia neta; ventas netas por día, cobros por método y productos más vendidos.
- [x] Foto del negocio: mercancía a costo, productos por reponer, fiao por cobrar y deudas con proveedores.
- [x] Reposición: agotados, bajo el mínimo o que se acaban en menos de 3 días, con la cantidad sugerida agrupada por proveedor; copiar o imprimir la lista. Aviso con el número en el menú.
- [x] Ajuste masivo de precios por porcentaje o por margen sobre costo, con vista previa, redondeo y auditoría. Margen visible en la lista de productos.
- [x] Respaldo automático cifrado al cerrar la caja, en una carpeta elegida (por ejemplo, un pendrive) o como descarga; aviso en la caja si está apagado o es viejo.

**Decisiones tomadas al implementarla:**
- **La contabilidad de los reportes es en USD** (los costos están en USD). Los gastos en Bs se convierten con la tasa vigente el día de cada gasto.
- **Gráficos:** una sola serie con un color validado (luminosidad, croma y contraste ≥ 3:1) para cada modo (`--grafico-serie`), columnas finas, rejilla tenue, detalle al pasar el mouse o enfocar con el teclado y vista de tabla. Sin librería de gráficos: HTML y CSS.
- **Cobros y vueltos por separado:** un vuelto en Bs a un pago en $ no se presenta como «cobro negativo».
- **Reposición:** cubre 7 días de ventas (según los últimos 14) o el doble del mínimo, lo que sea mayor; redondea hacia arriba a la presentación de compra más grande (bulto) o al medio kilo.
- **Contraseña del respaldo automático:** se guarda en el equipo para cifrar sin preguntar; protege la copia que sale (el pendrive), no el equipo. Las claves locales (equipo, bloqueo de PIN, esta contraseña) nunca se exportan.
- **Permiso nuevo `reportes.ver`** (solo el dueño), porque los reportes muestran costos y ganancias.

---

## 11. Estrategia de pruebas

- **Unitarias (Vitest):** dinero, redondeo, conversión, costo promedio, cuadre de pagos, saldo de fiao, cierre de caja. Son las piezas donde un error cuesta plata y deben estar cubiertas por completo.
- **De integración:** servicios contra una IndexedDB simulada (`fake-indexeddb`). Por ejemplo, que una venta descuente el stock y cree el cargo de fiao en la misma transacción.
- **De extremo a extremo (más adelante):** Playwright para el flujo de venta completo.

---

## 12. Pendientes

- [ ] Nombre comercial del sistema (no bloquea el inicio).
- [ ] Elegir la fuente automática de la tasa (se valida en la Fase 1).
- [ ] Arquitectura de sincronización (se decide en la Fase 6).

## 13. Glosario

- **Fiao:** venta a crédito informal a un cliente de confianza.
- **Fecha valor:** fecha desde la cual rige una tasa publicada por el BCV.
- **Kardex:** historial de entradas y salidas de un producto.
- **Arqueo:** conteo del efectivo al cerrar la caja, comparado con lo esperado.
- **Presentación:** forma de vender o comprar un producto (unidad, bulto x24, caja x20).
- **PWA:** aplicación web que se instala y funciona sin conexión.
