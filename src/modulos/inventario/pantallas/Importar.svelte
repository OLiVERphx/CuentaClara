<script lang="ts">
  import { redondeoBs, tasaDelDia } from '../../../app/estado.svelte';
  import { navegar } from '../../../app/router.svelte';
  import { formatearBs, formatearCantidad, formatearCosto, formatearUsd } from '../../../core/dinero/dinero';
  import { avisar, avisarError } from '../../../ui/notificaciones.svelte';
  import { descargarArchivo } from '../../../ui/descargar';
  import Icono from '../../../ui/Icono.svelte';
  import { inventario } from '../almacen.svelte';
  import { decodificar, generarPlantilla, validarCsv, type ResultadoValidacion } from '../csv';
  import { precioEnBs } from '../precios';
  import { importarProductos } from '../servicio';

  let resultado = $state<ResultadoValidacion | null>(null);
  let nombreArchivo = $state('');
  let importando = $state(false);
  const tasa = $derived(tasaDelDia());

  async function leerArchivo(e: Event & { currentTarget: HTMLInputElement }) {
    const archivo = e.currentTarget.files?.[0];
    if (!archivo) return;
    nombreArchivo = archivo.name;
    try {
      const texto = decodificar(await archivo.arrayBuffer());
      resultado = validarCsv(texto, inventario.indice.codigosEnUso());
    } catch (err) {
      avisarError(err);
    }
  }

  async function importar() {
    if (!resultado || resultado.validas.length === 0) return;
    importando = true;
    try {
      const n = await importarProductos(resultado.validas);
      avisar(`Se importaron ${n} productos.`);
      navegar('/productos');
    } catch (err) {
      avisarError(err);
    } finally {
      importando = false;
    }
  }
</script>

<div class="encabezado-pagina">
  <div class="fila">
    <a class="btn btn-fantasma" href="#/productos" aria-label="Volver"><Icono nombre="atras" /></a>
    <h1>Importar productos</h1>
  </div>
</div>

<div class="pila">
  <div class="tarjeta pila">
    <h2>1. Prepara el archivo</h2>
    <p>
      Descarga la plantilla, ábrela en Excel y llena una fila por producto. Luego guárdala como <strong>CSV</strong>
      (Archivo → Guardar como → «CSV (delimitado por comas)»).
    </p>
    <ul class="ayuda">
      <li><strong>nombre</strong> y <strong>precio</strong> son obligatorios.</li>
      <li><strong>unidad</strong>: <span class="mono">unidad</span> o <span class="mono">kg</span>. <strong>moneda</strong>: <span class="mono">USD</span> (por defecto) o <span class="mono">VES</span> para precio fijo en Bs.</li>
      <li><strong>costo_usd</strong>, <strong>stock</strong> y <strong>stock_minimo</strong> son opcionales. El código se genera solo si lo dejas vacío.</li>
      <li>Puedes escribir los decimales con coma o con punto.</li>
    </ul>
    <div>
      <button class="btn" onclick={() => descargarArchivo(generarPlantilla(), 'plantilla-productos.csv', 'text/csv;charset=utf-8')}>
        <Icono nombre="bajar" /> Descargar plantilla
      </button>
    </div>
  </div>

  <div class="tarjeta pila">
    <h2>2. Sube el archivo</h2>
    <label class="campo">
      <span>Archivo CSV</span>
      <input type="file" accept=".csv,text/csv" onchange={leerArchivo} />
    </label>
  </div>

  {#if resultado}
    <div class="tarjeta pila">
      <h2>3. Revisa y confirma</h2>
      <div class="fila">
        <span class="chip chip-normal">{resultado.validas.length} listos para importar</span>
        {#if resultado.errores.length > 0}<span class="chip chip-agotado">{resultado.errores.length} con errores</span>{/if}
        <span class="ayuda">{nombreArchivo}</span>
      </div>

      {#if resultado.columnasIgnoradas.length > 0}
        <div class="alerta alerta-aviso">Columnas que no se reconocieron y se ignorarán: {resultado.columnasIgnoradas.join(', ')}.</div>
      {/if}

      {#if resultado.errores.length > 0}
        <div class="pila-chica">
          <h3>Filas con errores (no se importarán)</h3>
          <div class="tabla-contenedor">
            <table>
              <thead><tr><th>Fila</th><th>Problema</th></tr></thead>
              <tbody>
                {#each resultado.errores.slice(0, 100) as e}
                  <tr><td class="num">{e.fila}</td><td>{e.mensaje}</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
          <p class="ayuda">Puedes corregirlas en Excel y volver a subir el archivo; las filas ya importadas aparecerán como «ya existe» si tienen código.</p>
        </div>
      {/if}

      {#if resultado.validas.length > 0}
        <div class="pila-chica">
          <h3>Vista previa</h3>
          <div class="tabla-contenedor">
            <table>
              <thead>
                <tr><th>Fila</th><th>Nombre</th><th>Categoría</th><th class="derecha">Precio</th><th class="derecha">Costo</th><th class="derecha">Stock</th></tr>
              </thead>
              <tbody>
                {#each resultado.validas.slice(0, 20) as v (v.fila)}
                  {@const d = v.datos}
                  <tr>
                    <td class="num suave">{v.fila}</td>
                    <td>{d.nombre}</td>
                    <td class="suave">{v.categoriaNombre}</td>
                    <td class="derecha num">
                      {d.monedaPrecio === 'USD' ? formatearUsd(d.precio) : formatearBs(d.precio)}
                      {#if d.monedaPrecio === 'USD' && tasa !== null}<span class="ayuda"> · {formatearBs(precioEnBs(d.precio, 'USD', tasa, redondeoBs()))}</span>{/if}
                    </td>
                    <td class="derecha num">{d.costoPromedio ? formatearCosto(d.costoPromedio) : '—'}</td>
                    <td class="derecha num">{formatearCantidad(v.stock, d.unidad)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if resultado.validas.length > 20}<p class="ayuda">…y {resultado.validas.length - 20} más.</p>{/if}
        </div>
        <div>
          <button class="btn btn-primario" onclick={importar} disabled={importando}>
            {importando ? 'Importando…' : `Importar ${resultado.validas.length} productos`}
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>
